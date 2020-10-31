import * as tsc from "typescript";
import * as TSTool from "tstool";
import * as path from "path";
import {AfterJsBundlerTransformer} from "./after_js_transformer";
import {BeforeJsBundlerTransformer} from "./before_js_transformer";
import {updateCliArgsWithTsconfig} from "impl/config";
import {logDebug, logErrorAndExit} from "utils/log";
import {readTextFile} from "utils/afs";
import {SeqSet} from "utils/seq_set";
import {TSToolContextImpl} from "impl/context";

export class TransformerControllerImpl implements TSTool.TransformerController {

	constructor(private readonly context: TSTool.Context){}

	private _transformers: tsc.CustomTransformers | null = null;
	private customTransformerDefs: TSTool.CustomTransformerDefinition[] = [];
	async getTransformers(): Promise<tsc.CustomTransformers> {
		return this._transformers ||= await this.createTransformers();
	}

	onModuleDelete(moduleName: string): void {
		this.customTransformerDefs.forEach(def => def.onModuleDelete && def.onModuleDelete(moduleName));
	}

	private transformerFactoriesFromDefinitions(defs: TSTool.CustomTransformerDefinition[], key: keyof(TSTool.CustomTransformerDefinition) & ("createForBefore" | "createForAfter")): tsc.CustomTransformerFactory[] {
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

	private async buildTransformerProjects(): Promise<TSTool.CustomTransformerDefinition[]>{
		let allTransformers = [] as TSTool.CustomTransformerDefinition[];

		for(let transformerProjectTsconfig of (this.context.config.transformerProjects || [])){
			let configPath = path.resolve(path.dirname(this.context.config.tsconfigPath), transformerProjectTsconfig);
			let config = updateCliArgsWithTsconfig({tsconfigPath: configPath});
			config.watchMode = false;
			config.noLoaderCode = true;
			config.embedTslib = false;
			let context = new TSToolContextImpl(config)
			logDebug("Building transformer project: " + configPath);
			await context.compiler.run();
			await context.bundler.produceBundle();
			if(!context.compiler.lastBuildWasSuccessful){
				logErrorAndExit("Transformer project " + configPath + " build failed.");
			}

			let transformers: TSTool.CustomTransformerDefinition[];
			try {
				transformers = await this.getTransformersFromBareBundle(context);
			} catch(e: unknown){
				logErrorAndExit("Failed to run transformer project " + context.config.tsconfigPath + ": " + ((e as Error).stack || (e + "")));
			}
			transformers.forEach(t => this.validateTransformer(t, context));
			allTransformers.push(...transformers);
		}

		return allTransformers;
	}

	// немного темной магии на тему получения трансформеров из их кода
	// на самом деле просто eval-им их код
	// добавляя в обертку некоторые завязки на тему того, что передавать в энтрипоинт и что делать с результатом
	private getTransformersFromBareBundle(context: TSTool.Context): Promise<TSTool.CustomTransformerDefinition[]>{
		return new Promise(async (ok, bad) => {
			try {

				let bareCode = await readTextFile(context.config.outFile);
				let wrappedCode = await context.bundler.wrapBundleCode(bareCode, {
					afterEntryPointExecuted: "transformerBundleExecutionResultReceiverFunction",
					entryPointArgCode: ["transformerProjectEntrypointArgumentContext"]
				});

				this.invokeTransformerBundleCode(wrappedCode, async (err, transOrPromise) => {
					if(err){
						bad(err);
					} else {
						try {
							let trans = await Promise.resolve(transOrPromise);
							let arr = Array.isArray(trans)? trans: [trans];
							ok(arr);
						} catch(e){ bad(e) }
					}
				}, this.context);

			} catch(e){ bad(e) }
		})
	}

	private invokeTransformerBundleCode(wrappedTransformerBundleCode: string, transformerBundleExecutionResultReceiverFunction: (err: unknown, transformers: TSTool.TransformerProjectEntryPointReturnType) => void, transformerProjectEntrypointArgumentContext: TSTool.Context): void {
		void transformerBundleExecutionResultReceiverFunction;
		void transformerProjectEntrypointArgumentContext;
		eval(wrappedTransformerBundleCode);
	}

	private validateTransformer(trans: TSTool.CustomTransformerDefinition, context: TSTool.Context){
		if(typeof(trans) !== "object" || trans === null){
			logErrorAndExit("Transformer from " + context.config.tsconfigPath + " is not object (or is null): " + trans);
		}
		if(!trans.transformerName){
			logErrorAndExit("Transformer from " + context.config.tsconfigPath + " has no name. This is not allowed.");
		}
		if(!trans.createForAfter && !trans.createForBefore){
			logErrorAndExit("Transformer " + trans.transformerName + " has neither of instance creation functions. This is not allowed.");
		}
	}

	private orderCustomTransformers(transformers: TSTool.CustomTransformerDefinition[]): TSTool.CustomTransformerDefinition[] {
		let map = {} as {[k: string]: TSTool.CustomTransformerDefinition};
		transformers.forEach(t => {
			if(map[t.transformerName]){
				logErrorAndExit("There is transformers with duplicate name: " + t.transformerName + ". This is not allowed.");
			}
			map[t.transformerName] = t;
		});

		let ordering = new Map<string, number>();
		let currentlyVisiting = new SeqSet<string>();

		let visit = (transformer: TSTool.CustomTransformerDefinition): number => {
			if(currentlyVisiting.has(transformer.transformerName)){
				logErrorAndExit("Recursive transformer dependency: " + currentlyVisiting.seq.join(" -> "));
			}
			currentlyVisiting.push(transformer.transformerName);
			try {
				let resultOrderingNumber = 0;

				let doWithOther = (t: TSTool.CustomTransformerDefinition) => {
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
							logErrorAndExit("Transformer " + transformer.transformerName + " requires other transformer " + name + " to be present, but it's not.");
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