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

	async startWatch(){
		await this.beforeStart();

		const watchDir = tsc.sys.watchDirectory;
		const watchFile = tsc.sys.watchFile;

		if(!watchFile){
			// на самом деле, тут можно было попробовать чего-нибудь сделать, как-нибудь это обойти
			// но я бы посмотрел на такие системы
			logErrorAndExit("This system provides no file watcher! Watch mode will not work properly.");
		}

		/*
		о том, что здесь происходит и почему
		нам нужно отслеживать начало и конец компиляции, чтобы не брать неконсистентные js-файлы в бандл
		для этого мы используем статус репортер и файлвотчеры
		когда файл/дир вотчер репортит об изменениях - компиляция считается начатой
		когда статус репортер выдает количество ошибок (а не undefined) - компиляция считается законченой
		но! при изменениях директории статусрепортер с количеством ошибок иногда не вызывается (никогда не вызывается?)
		поэтому каждый раз, когда дергается дирвотчер, также дергаем файлвотчер
		это нужно исключительно для того, чтобы руками вызвать рекомпиляцию, которая завершится вызовом статусрепортера

		еще у меня были тут тревоги на тему того, что произойдет при изменениях в файлах в процессе компиляции
		произойдет следующее - компиляция завершится, затем начнется заново и завершится заново
		т.е. обработка вотчеров, стриггерившихся за время компиляции, откладывается до конца компиляции
		и поэтому я завел счетчик измененных файлов. если он не 0 - то скоро будет компиляция и брать файлы не надо бы
		*/
		let watchFileCallback: tsc.FileWatcherCallback | null = null;

		let system: tsc.System = {
			...tsc.sys,
			watchFile: (path: string, callback: tsc.FileWatcherCallback, pollingInterval?: number, options?: tsc.WatchOptions) => {
				watchFileCallback = callback;
				return watchFile(path, (fileName, kind) => {
					//logInfo("FILE CHANGED: " + fileName + " (kind = " + kind + ")");
					callback(fileName, kind);
					this.startCompileLog(fileName);
					this.filesChangedSinceLastCompile++;
				}, pollingInterval, options)
			},
			watchDirectory: !watchDir? undefined: 
				(path: string, callback: tsc.DirectoryWatcherCallback, recursive?: boolean, options?: tsc.WatchOptions) => {
					return watchDir(path, (fileName: string) => {
						//logInfo("DIR CHANGED: " + fileName);
						callback(fileName);
						if(watchFileCallback){
							watchFileCallback(fileName, tsc.FileWatcherEventKind.Changed);
						}
						this.startCompileLog(fileName);
						this.filesChangedSinceLastCompile++;
					}, recursive, options)
			}
		}

		/*
		let watchHost = tsc.createWatchCompilerHost(
			this.config.tsconfigPath,
			this.tscMergedConfig.options,
			system,
			undefined,
			processTypescriptDiagnosticEntry, // errors are reported through here
			(diagnostic: tsc.Diagnostic, newLine: string, options: tsc.CompilerOptions, errorCount?: number) => {
				void newLine;
				void options;
				if(errorCount !== undefined){
					this._errorCount = errorCount;
					this.endCompile();
				} else {
					this.isCompiling = true;
					// сбрасываем счетчик здесь
					// если он увеличится за время компиляции - то за время компиляции какие-то файлы изменились
					// и скоро будет новая рекомпиляция
					this.filesChangedSinceLastCompile = 0;
				}
				
				if(diagnostic.code !== 6031 && diagnostic.code !== 6032 && diagnostic.code !== 6193 && diagnostic.code !== 6194){
					processTypescriptDiagnosticEntry(diagnostic);
				}
			}
		);
		*/

		/*

		logInfo("Starting initial compilation for watch mode.");
		this.isCompiling = true;

		this._watch = tsc.createWatchProgram(watchHost);

		// should we re-create host here? could we use watchost instead?
		this._host = tsc.createCompilerHost(this._watch.getProgram().getCompilerOptions());

		processTypescriptDiagnostics(tsc.getPreEmitDiagnostics(this.program));
		*/
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

		let builder = tsc.createSolutionBuilderWithWatch(host, this.tscMergedConfig.rootNames, { incremental: false }, {})


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
	}

}