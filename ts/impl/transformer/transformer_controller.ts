import * as tsc from "typescript";
import {Imploder} from "imploder";
import * as path from "path";
import {AfterJsBundlerTransformer} from "./after_js_transformer";
import {BeforeJsBundlerTransformer} from "./before_js_transformer";
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
		let transformersFromProjects = await this.loadTransformers();
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

	private async loadTransformers(): Promise<Imploder.CustomTransformerDefinition[]>{
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

}