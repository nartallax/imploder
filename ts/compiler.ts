import * as tsc from "typescript";
import {TSToolConfig} from "config";
import * as path from "path";
import {BeforeJsBundlerTransformer} from "transformer/before_js_transformer";
import {ModuleMetadataStorage} from "module_meta_storage";
import {Bundler} from "bundler";
import {writeTextFile, unlinkRecursive, fileExists} from "afs";
import {ModulePathResolver} from "module_path_resolver";
import {AfterJsBundlerTransformer} from "transformer/after_js_transformer";
import {processTypescriptDiagnosticEntry, processTypescriptDiagnostics} from "tsc_diagnostics";

/*
Полезные доки и примеры: 
https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
https://basarat.gitbook.io/typescript/overview/
https://www.typescriptlang.org/docs/handbook/module-resolution.html
*/

type MergedTscConfig = tsc.ParsedCommandLine & { rootNames: string[] }

export class Compiler {

	readonly config: TSToolConfig;
	private readonly tscMergedConfig: MergedTscConfig;
	private readonly transformers: tsc.CustomTransformerFactory[];
	readonly metaStorage: ModuleMetadataStorage;
	readonly bundler: Bundler;

	constructor(config: TSToolConfig, transformers: tsc.CustomTransformerFactory[] = []){
		this.config = config;
		this.tscMergedConfig = {
			...config.tscParsedCommandLine,
			rootNames: [path.resolve(path.dirname(config.tsconfigPath), config.entryModule)]
		}
		this.transformers = transformers;
		this.bundler = new Bundler(this);
		this.metaStorage = new ModuleMetadataStorage();
	}

	private async beforeStart(){
		if(!this.config.preserveOutDir && this.config.tscParsedCommandLine.options.outDir){
			if(await fileExists(this.config.tscParsedCommandLine.options.outDir)){
				await unlinkRecursive(this.config.tscParsedCommandLine.options.outDir);
			}
		}
	}

	private _watch: tsc.Watch<tsc.BuilderProgram> | null = null;
	private _program: tsc.Program | null = null;
	get program(): tsc.Program {
		if(this._program){
			return this._program;
		}
		if(this._watch){
			return this._watch.getProgram().getProgram();
		}
		throw new Error("Compiler not started in any of available modes.");
	}

	private _host: tsc.CompilerHost | null = null;
	get compilerHost(): tsc.CompilerHost {
		if(!this._host){
			throw new Error("Compiler not started, no compiler host available.");
		}
		return this._host;
	}

	private _modulePathResolver: ModulePathResolver | null = null;
	get modulePathResolver(){
		if(this._modulePathResolver === null){
			this._modulePathResolver = new ModulePathResolver(this.config.tsconfigPath, this.tscMergedConfig.options, this);
		}
		return this._modulePathResolver;
	}

	async startWatch(){
		await this.beforeStart();

		let watchHost = tsc.createWatchCompilerHost(
			this.config.tsconfigPath,
			this.tscMergedConfig.options,
			tsc.sys,
			undefined,
			processTypescriptDiagnosticEntry
		);
		this._watch = tsc.createWatchProgram(watchHost);
		this._host = tsc.createCompilerHost(this._watch.getProgram().getCompilerOptions())

		processTypescriptDiagnostics(tsc.getPreEmitDiagnostics(this.program));
	}

	/** Запуститься для разовой компиляции */
	async runSingle(){
		await this.beforeStart();

		this._host = tsc.createCompilerHost(this.tscMergedConfig.options);
		this._program = tsc.createProgram({
			...this.tscMergedConfig,
			host: this._host
		});
		
		processTypescriptDiagnostics(tsc.getPreEmitDiagnostics(this.program));

		let emitResult = this.program.emit(undefined, undefined, undefined, undefined, {
			before: [
				context => new BeforeJsBundlerTransformer(context, this.metaStorage, this.modulePathResolver),
				...this.transformers
			],
			after: [
				context => new AfterJsBundlerTransformer(context, this.metaStorage, this.modulePathResolver)
			]
		});
		processTypescriptDiagnostics(emitResult.diagnostics);

		let bundle = await this.bundler.produceBundle();
		await writeTextFile(this.config.outFile, bundle);
	}

}