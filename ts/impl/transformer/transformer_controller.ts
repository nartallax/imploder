import * as Tsc from "typescript";
import {Imploder} from "imploder";
import {AfterJsBundlerTransformer} from "impl/transformer/after_js_transformer";
import {BeforeJsBundlerTransformer} from "impl/transformer/before_js_transformer";
import {WrapperTransformer} from "impl/transformer/wrapper_transformer";
import {createTransformerFromTransformerRef, TransformerRefWithFactory} from "impl/transformer/transformer_creators";


export class TransformerControllerImpl implements Imploder.TransformerController {

	constructor(private readonly context: Imploder.Context){}

	private customTransformerDefs: TransformerRefWithFactory[] | null = null;
	
	onModuleDelete(moduleName: string): void {
		if(!this.customTransformerDefs){
			throw new Error("Fatal: transformers not initialized, could not handle module deletion.");
		}
		this.customTransformerDefs.forEach(def => def.factory.onModuleDelete && def.factory.onModuleDelete(moduleName));
	}

	private sortWrapTransformers(refs: TransformerRefWithFactory[], onError: Imploder.TransformerErrorHandler): Tsc.CustomTransformerFactory[] {
		return refs
			.map((x, i) => ({ref: x, srcOrder: i}))
			.sort((a, b) => {
				let aOrd = a.ref.ref.transformerExecutionOrder;
				if(typeof(aOrd) !== "number"){
					aOrd = Number.MAX_SAFE_INTEGER;[
					]
				}

				let bOrd = b.ref.ref.transformerExecutionOrder;
				if(typeof(bOrd) !== "number"){
					bOrd = Number.MAX_SAFE_INTEGER;
				}

				return (aOrd - bOrd) || (a.srcOrder - b.srcOrder);
			})
			.map(x => {
				let factory = x.ref.factory;
				let wrappedFactory: Tsc.CustomTransformerFactory = transformContext => {
					let baseTransformer = factory(transformContext);
					let wrapperTransformer = new WrapperTransformer(onError, baseTransformer, x.ref.ref)
					return wrapperTransformer;
				}
				return wrappedFactory;
			})
	}

	async createTransformers(onError: Imploder.TransformerErrorHandler): Promise<Tsc.CustomTransformers>{
		let refs = (this.customTransformerDefs ||= await this.loadTransformers());

		let beforeTranss = refs.filter(x => !x.ref.after && !x.ref.afterDeclarations);
		let afterTranss = refs.filter(x => !!x.ref.after);
		let afterDeclTranss = refs.filter(x => !!x.ref.afterDeclarations);

		let result: Tsc.CustomTransformers = {
			before: [
				...this.sortWrapTransformers(beforeTranss, onError),
				context => new BeforeJsBundlerTransformer(context, this.context),
			],
			after: [
				...this.sortWrapTransformers(afterTranss, onError),
				context => new AfterJsBundlerTransformer(context, this.context),
			],
			afterDeclarations: this.sortWrapTransformers(afterDeclTranss, onError)
		}

		return result;
	}

	private async loadTransformers(): Promise<TransformerRefWithFactory[]>{
		let allTransformers = [] as TransformerRefWithFactory[];

		for(let ref of (this.context.config.plugins || [])){
			try {
				if(ref.transform){
					allTransformers.push(await createTransformerFromTransformerRef(this.context, ref));
				}
			} catch(e){
				this.context.logger.errorAndExit("Transformer project " + JSON.stringify(ref) + " failed to load: " + e.stack)
			}
		}

		return allTransformers;
	}

}