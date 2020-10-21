import * as tsc from "typescript";
import {TSToolConfig} from "config";
import * as path from "path";
import {BeforeJsBundlerTransformer} from "transformer/before_js_transformer";
import {ModuleMetadataStorage} from "module_meta_storage";
import {Bundler} from "bundler";
import {unlinkRecursive, fileExists, mkdir} from "afs";
import {ModulePathResolver} from "module_path_resolver";
import {AfterJsBundlerTransformer} from "transformer/after_js_transformer";
import {processTypescriptDiagnosticEntry, processTypescriptDiagnostics} from "tsc_diagnostics";
import {logInfo, logErrorAndExit} from "log";

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
		const outDir = this.config.tscParsedCommandLine.options.outDir;
		if(!this.config.preserveOutDir && outDir){
			if(await fileExists(outDir)){
				await unlinkRecursive(outDir);
				// создавать тут директорию нужно для вотчмода
				// потому что иначе он сразу же после начала работы дергается на свежесозданную директорию с выходными данными
				// это не очень страшно, но неприятно
				await mkdir(outDir);
			}
		}
	}

	private _proj: tsc.BuildInvalidedProject<tsc.BuilderProgram> | null = null;
	private _program: tsc.Program | null = null;
	get program(): tsc.Program {
		if(this._program){
			return this._program;
		}
		if(this._proj){
			let prog = this._proj.getProgram();
			if(!prog){
				// what? why?
				logErrorAndExit("There is no program returned in watchmode.");
			}
			return prog;
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

	private _errorCount: number = 0;
	get isInSuccessfulState(): boolean {
		return this._errorCount === 0;
	}

	private isCompiling = false;
	private filesChangedSinceLastCompile = 0;

	private compileEndWaiters: (() => void)[] = [];
	waitCompileEnd(): Promise<void>{
		if(!this.isCompiling && this.filesChangedSinceLastCompile < 1){
			return Promise.resolve();
		} else {
			return new Promise(ok => this.compileEndWaiters.push(ok));
		}
	}

	private startCompileLog(sourcePath?: string){
		if(this.filesChangedSinceLastCompile === 0){
			logInfo(`Compilation starting: change detected${sourcePath !== undefined? " (in " + sourcePath + ")": ""}`);
		}
	}

	private endCompile(){
		let wasCompiling = this.isCompiling;
		this.isCompiling = false;
		if(this.filesChangedSinceLastCompile < 1){
			if(wasCompiling){
				logInfo(`Compilation ended (errors: ${this._errorCount})`);
			}
			let waiters = this.compileEndWaiters;
			this.compileEndWaiters = [];
			waiters.forEach(watcher => watcher());
		} else {
			logInfo(`Compilation ended, but soon new will start (unprocessed changes: ${this.filesChangedSinceLastCompile})`);
		}
	}

	private createTransformers(): tsc.CustomTransformers {
		return {
			before: [
				context => new BeforeJsBundlerTransformer(context, this.metaStorage, this.modulePathResolver),
				...this.transformers
			],
			after: [
				context => new AfterJsBundlerTransformer(context, this.metaStorage, this.modulePathResolver)
			]
		}
	}


	async startWatch(){
		await this.beforeStart();

		let system: tsc.System = {
			...tsc.sys,
			readFile: (filePath, encoding) => {
				if(path.resolve(filePath) === this.config.tsconfigPath){
					// TODO: test for enum values; that is, "target"
					console.log(JSON.stringify(this.config.tscParsedCommandLine.raw, null, 4));
					return JSON.stringify(this.config.tscParsedCommandLine.raw);
				}
				return tsc.sys.readFile(filePath, encoding);
			}
		}

		let host = tsc.createSolutionBuilderWithWatchHost(
			system, 
			undefined,
			diag => {
				console.log("DIAG A");
				processTypescriptDiagnosticEntry(diag);
			}, 
			diag => {
				console.log("DIAG B");
				processTypescriptDiagnosticEntry(diag);
			},
			(diagnostic: tsc.Diagnostic, newLine: string, options: tsc.CompilerOptions, errorCount?: number) =>{
				console.log("WATCHSTATUS: ERRORS = " + errorCount);
				void newLine;
				void options;
				processTypescriptDiagnosticEntry(diagnostic);
			}
		);

		let builder = tsc.createSolutionBuilderWithWatch(host, [path.dirname(this.tscMergedConfig.options.outDir as string)], { incremental: false }, {});

		void this.startCompileLog;
		void this.endCompile;
		void builder;

		let proj = builder.getNextInvalidatedProject();

		if(!proj){
			logErrorAndExit("Got no project for initial compilation.");
		}

		if(proj.kind !== tsc.InvalidatedProjectKind.Build){
			logErrorAndExit("Wrong initial compilation project kind: " + tsc.InvalidatedProjectKind[proj.kind]);
		}

		this._proj = proj;
		let program = proj.getProgram();
		if(!program){
			throw new Error("No program get from initial project.");
		}
		this._host = tsc.createCompilerHost(program.getCompilerOptions());
		let transformers = this.createTransformers();
		console.log("EMITTING");
		proj.emit(undefined, undefined, undefined, undefined, transformers)
		console.log("BUILDING");

		builder.build();
		console.log("DONE");
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

		let emitResult = this.program.emit(undefined, undefined, undefined, undefined, this.createTransformers());
		processTypescriptDiagnostics(emitResult.diagnostics);
	}

}