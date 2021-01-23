import * as tsc from "typescript";
import {Imploder} from "imploder";
import * as path from "path";
import {AfterJsBundlerTransformer} from "./after_js_transformer";
import {BeforeJsBundlerTransformer} from "./before_js_transformer";
import {SeqSet} from "utils/seq_set";
import {getTransformersFromImploderBundle, getTransformersFromImploderProject} from "impl/transformer/transformer_creators";

export class TransformerControllerImpl implements Imploder.TransformerController {

	constructor(private readonly context: Imploder.Context){}

	private _transformers: tsc.CustomTransformers | null = null;
	private customTransformerDefs: Imploder.CustomTransformerDefinition[] = [];
	async getTransformers(): Promise<tsc.CustomTransformers> {
		return this._transformers ||= await this.createTransformers();
	}

	onModuleDelete(moduleName: string): void {
		this.customTransformerDefs.forEach(def => def.onModuleDelete && def.onModuleDelete(moduleName));
	}

	private transformerFactoriesFromDefinitions(defs: Imploder.CustomTransformerDefinition[], key: keyof(Imploder.CustomTransformerDefinition) & ("createForBefore" | "createForAfter")): tsc.CustomTransformerFactory[] {
		return defs.map(x => {
			const creator = x[key];
			if(!creator){
				return null;
			}
			let factory: tsc.CustomTransformerFactory = context => creator.call(x, context)
			return factory;
		}).filter(x => !!x) as tsc.CustomTransformerFactory[];
	}

	private async createTransformers(): Promise<tsc.CustomTransformers> {
		let transformersFromProjects = await this.buildTransformerProjects();
		transformersFromProjects = this.orderCustomTransformers(transformersFromProjects);
		this.customTransformerDefs = transformersFromProjects;

		return {
			before: [
				...this.transformerFactoriesFromDefinitions(transformersFromProjects, "createForBefore"),
				context => new BeforeJsBundlerTransformer(context, this.context),
			],
			after: [
				...this.transformerFactoriesFromDefinitions(transformersFromProjects, "createForAfter"),
				context => new AfterJsBundlerTransformer(context, this.context)
			]
		}
	}

	private async buildTransformerProjects(): Promise<Imploder.CustomTransformerDefinition[]>{
		let allTransformers = [] as Imploder.CustomTransformerDefinition[];

		for(let ref of (this.context.config.transformers || [])){
			try {
				let bundleRef = ref as Imploder.TransformerFromImploderBundle;
				if(bundleRef.imploderBundle){
					allTransformers.push(...await getTransformersFromImploderBundle(bundleRef.imploderBundle, this.context));
				} else {
					let projectRef = ref as Imploder.TransformerFromImploderProject;
					let configPath = path.resolve(path.dirname(this.context.config.tsconfigPath), projectRef.imploderProject);
					allTransformers.push(...await getTransformersFromImploderProject(configPath, this.context));
				}
			} catch(e){
				this.context.logger.errorAndExit("Transformer project " + JSON.stringify(ref) + " failed to load: " + e.message)
			}
		}

		return allTransformers;
	}

	private orderCustomTransformers(transformers: Imploder.CustomTransformerDefinition[]): Imploder.CustomTransformerDefinition[] {
		let map = {} as {[k: string]: Imploder.CustomTransformerDefinition};
		transformers.forEach(t => {
			if(map[t.transformerName]){
				this.context.logger.errorAndExit("There is transformers with duplicate name: " + t.transformerName + ". This is not allowed.");
			}
			map[t.transformerName] = t;
		});

		let ordering = new Map<string, number>();
		let currentlyVisiting = new SeqSet<string>();

		let visit = (transformer: Imploder.CustomTransformerDefinition): number => {
			if(currentlyVisiting.has(transformer.transformerName)){
				this.context.logger.errorAndExit("Recursive transformer dependency: " + currentlyVisiting.seq.join(" -> "));
			}
			currentlyVisiting.push(transformer.transformerName);
			try {
				let resultOrderingNumber = 0;

				let doWithOther = (t: Imploder.CustomTransformerDefinition) => {
					let storedNum = ordering.get(t.transformerName);
					let num = storedNum !== undefined? storedNum: visit(t) + 1;
					resultOrderingNumber = Math.max(resultOrderingNumber, num);
				}

				if(transformer.launchAfter){
					transformer.launchAfter.forEach(name => {
						let t = map[name];
						if(t){
							doWithOther(t);
						}
					})
				}

				if(transformer.launchAfterRequired){
					transformer.launchAfterRequired.forEach(name => {
						let t = map[name];
						if(!t){
							this.context.logger.errorAndExit("Transformer " + transformer.transformerName + " requires other transformer " + name + " to be present, but it's not.");
						}
						doWithOther(t);
					});
				}

				ordering.set(transformer.transformerName, resultOrderingNumber);
				return resultOrderingNumber;
			} finally {
				currentlyVisiting.pop();
			}
		}

		transformers.forEach(transformer => {
			if(!ordering.has(transformer.transformerName)){
				visit(transformer);
			}
		});

		return transformers.sort((a, b) => {
			let numA = ordering.get(a.transformerName) || 0;
			let numB = ordering.get(b.transformerName) || 0;
			if(numA !== numB){
				return numA - numB;
			}
			return a.transformerName < b.transformerName? -1: a.transformerName > b.transformerName? 1: 0;
		})
	}

}