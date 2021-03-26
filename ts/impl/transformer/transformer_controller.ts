import * as tsc from "typescript";
import {Imploder} from "imploder";
import * as path from "path";
import {AfterJsBundlerTransformer} from "./after_js_transformer";
import {BeforeJsBundlerTransformer} from "./before_js_transformer";
import {getTransformersFromImploderBundle, getTransformersFromImploderProject} from "impl/transformer/transformer_creators";
import {WrapperTransformer} from "impl/transformer/wrapper_transformer";


export class TransformerControllerImpl implements Imploder.TransformerController {

	constructor(private readonly context: Imploder.Context){}

	private customTransformerDefs: Imploder.CustomTransformerDefinition[] | null = null;
	
	onModuleDelete(moduleName: string): void {
		if(!this.customTransformerDefs){
			throw new Error("Fatal: transformers not initialized, could not handle module deletion.");
		}
		this.customTransformerDefs.forEach(def => def.onModuleDelete && def.onModuleDelete(moduleName));
	}

	private transformerFactoriesFromDefinitions(defs: Imploder.CustomTransformerDefinition[], onError: Imploder.TransformerErrorHandler, key: keyof(Imploder.CustomTransformerDefinition) & ("createForBefore" | "createForAfter")): tsc.CustomTransformerFactory[] {
		return defs.map(transDef => {
			const creator = transDef[key];
			if(!creator){
				return null;
			}
			let factory: tsc.CustomTransformerFactory = context => {
				let baseTransformer = creator.call(transDef, context);
				let wrapperTransformer = new WrapperTransformer(onError, baseTransformer, transDef)
				return wrapperTransformer;
			}
			return factory;
		}).filter(x => !!x) as tsc.CustomTransformerFactory[];
	}

	async createTransformers(onError: Imploder.TransformerErrorHandler): Promise<tsc.CustomTransformers>{
		let defs = (this.customTransformerDefs ||= await this.loadTransformers());

		let result: tsc.CustomTransformers = {
			before: [
				...this.transformerFactoriesFromDefinitions(defs, onError, "createForBefore"),
				context => new BeforeJsBundlerTransformer(context, this.context),
			],
			after: [
				...this.transformerFactoriesFromDefinitions(defs, onError, "createForAfter"),
				context => new AfterJsBundlerTransformer(context, this.context),
			]
		}

		return result;
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