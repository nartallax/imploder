import * as tsc from "typescript";
import {TSToolConfig} from "impl/config";
import * as path from "path";
import {BeforeJsBundlerTransformer} from "transformer/before_js_transformer";
import {ModuleMetadataStorage} from "impl/module_meta_storage";
import {unlinkRecursive, fileExists, mkdir} from "utils/afs";
import {ModulePathResolver} from "impl/module_path_resolver";
import {AfterJsBundlerTransformer} from "transformer/after_js_transformer";
import {processTypescriptDiagnosticEntry, processTypescriptDiagnostics} from "utils/tsc_diagnostics";
import {logInfo, logError, logDebug, logWarn} from "utils/log";
import {Lock} from "utils/lock";

/*
Полезные доки и примеры: 
https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
https://basarat.gitbook.io/typescript/overview/
https://www.typescriptlang.org/docs/handbook/module-resolution.html
https://stackoverflow.com/questions/62026189/typescript-custom-transformers-with-ts-createwatchprogram
*/

/** обертка над компилятором tsc */
export class Compiler {

	readonly config: TSToolConfig;
	private readonly tscConfig: tsc.ParsedCommandLine & { rootNames: string[] };
	private readonly transformers: tsc.CustomTransformerFactory[];
	readonly metaStorage: ModuleMetadataStorage;
	readonly buildLock = new Lock();

	constructor(config: TSToolConfig, transformers: tsc.CustomTransformerFactory[] = []){
		this.config = config;
		this.tscConfig = {
			...config.tscParsedCommandLine,
			rootNames: [path.resolve(path.dirname(config.tsconfigPath), config.entryModule)]
		}
		this.transformers = transformers;
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
	private _builderProgram: tsc.BuilderProgram | null = null;
	get program(): tsc.Program {
		if(this._program){
			return this._program;
		}
		if(this._watch){
			return this._watch.getProgram().getProgram();
		}
		if(this._builderProgram){
			return this._builderProgram.getProgram();
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
			this._modulePathResolver = new ModulePathResolver(this.config.tsconfigPath, this.tscConfig.options, this);
		}
		return this._modulePathResolver;
	}

	get isInSuccessfulState(): boolean {
		return this._errorCount === 0
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

	// создать экземпляр tsc.System для работы в вотчмоде
	private createSystemForWatch(): tsc.System {
		const watchFile = tsc.sys.watchFile;
		const watchDir = tsc.sys.watchDirectory;

		return {
			...tsc.sys,
			readFile: (filePath, encoding) => {
				// это такой способ прокидывать конфиг в tsc
				// просто позволить прочесть tsc имеющийся конфиг нельзя, мы его меняли
				// но и в какие-либо из используемых классов этот конфиг прокинуть нельзя
				// поэтому перехватываем чтение здесь
				if(path.resolve(filePath) === this.config.tsconfigPath){
					return JSON.stringify(this.config.tscParsedCommandLine.raw);
				}
				return tsc.sys.readFile(filePath, encoding);
			},
			watchFile: !watchFile? undefined:
				(path: string, callback: tsc.FileWatcherCallback, pollingInterval?: number, options?: tsc.WatchOptions) => {
					let watcher = watchFile(path, (fileName, kind) => {
						let module = this.modulePathResolver.getCanonicalModuleName(fileName);
						this.metaStorage.deleteModule(module);
						if(this._watch){
							callback(fileName, kind);
							this.notifyFsObjectChange(fileName);
						}
					}, pollingInterval, options);
					return watcher;
			},
			watchDirectory: !watchDir? undefined: 
				(path: string, callback: tsc.DirectoryWatcherCallback, recursive?: boolean, options?: tsc.WatchOptions) => {
					let watcher = watchDir(path, (fileName: string) => {
						if(this._watch){
							callback(fileName);
							// не берем здесь лок, т.к. за изменением только директории не всегда следует компиляция
							// если мы возьмем здесь лок из-за изменений файлов, то потом разлочимся неизвестно когда
							//this.notifyFsObjectChange(fileName);
						}
					}, recursive, options);
					return watcher;
			}
		}
	}

	private createWatchHost(system: tsc.System){
		let transformers = this.createTransformers();

		// зачем такие сложности, с созданием двух хостов?
		// первый хост нужен для того, чтобы вызывать на нем createProgram
		// смысл в том, что обычно createProgram будет чем-то вроде createEmitAndSemanticDiagnosticsBuilderProgram
		// но я не хочу это хардкодить. поэтому я получаю её таким вот непрямым путем
		// в худшем случае, при изменениях тул перестанет компилиться/работать
		let defaultHost = tsc.createWatchCompilerHost(
			this.config.tsconfigPath,
			this.tscConfig.options,
			system,
			undefined,
			processTypescriptDiagnosticEntry,
			(diagnostic: tsc.Diagnostic) => {
				logError("DEFAULT HOST EMITTED DIAG!");
				processTypescriptDiagnosticEntry(diagnostic);
			}
		)

		return tsc.createWatchCompilerHost(
			this.config.tsconfigPath,
			this.tscConfig.options,
			system,
			(rootNames, options, host, oldProgram, configFileParsingDiagnostics, projectReferences) => {
				// подменять createProgram нужно для того, чтобы можно было подсовывать произвольные трансформеры в его emit
				let result = defaultHost.createProgram(rootNames, options, host, oldProgram, configFileParsingDiagnostics, projectReferences);
				let origEmit = result.emit;
				this._builderProgram = result;
				result.emit = (targetSourceFile, writeFile, cancellationToken, emitOnlyDtsFiles, customTransformers) => {
					this.startBuild();
					let res: tsc.EmitResult;
					try {
						res = origEmit.call(result, 
							targetSourceFile,
							writeFile,
							cancellationToken,
							emitOnlyDtsFiles,
							!customTransformers? transformers: {
								before: [ ...(customTransformers.before || []), ...(transformers.before || []) ],
								after: [ ...(customTransformers.after || []), ...(transformers.after || [])],
								afterDeclarations: [ ...(customTransformers.afterDeclarations || []), ...(transformers.afterDeclarations || []) ],
							}
						)
					} finally {
						this.endBuild();
					}
					return res;
				}
				return result;
			},
			diag => {
				this.lastBuildDiag.push(diag);
				if(!this.config.noBuildDiagnosticMessages){
					processTypescriptDiagnosticEntry(diag);
				}
			},
			(d, _, __, ___) => {
				if(d.code === 6031 || d.code === 6032){
					// build started, skipping
				} else if(d.code === 6193 || d.code === 6194){
					// build ended, skipping
				} else {
					processTypescriptDiagnosticEntry(d);
				}
			}
		);
	}

	private hasFileChangesLock = false;
	private filesChanged = 0;
	private _errorCount = 0;
	private lastBuildDiag = [] as tsc.Diagnostic[]
	private startBuild(){
		this.buildLock.lock();
		this.lastBuildDiag = [];
		this.filesChanged = 0;
		logDebug("Build started.");
	}

	getLastBuildDiagnostics(): ReadonlyArray<tsc.Diagnostic>{
		return this.lastBuildDiag;
	}

	private endBuild(){
		let errorCount = this._errorCount = this.lastBuildDiag.filter(_ => _.category === tsc.DiagnosticCategory.Error).length;
		if(this.filesChanged !== 0){
			logInfo(`Build ended, errors: ${errorCount} (but soon new one will start, files changed since build start = ${this.filesChanged})`);
		} else {
			(errorCount !== 0? logWarn: logDebug)(`Build ended, errors: ${errorCount}`);
			this.buildLock.unlock();
			if(this.hasFileChangesLock){
				this.hasFileChangesLock = false;
				this.buildLock.unlock();
			}
			logDebug("Lock level after build end: " + this.buildLock.getLockLevel());
		}
	}

	private notifyFsObjectChange(fsObjectChangedPath: string): void {
		logDebug("FS object change: " + fsObjectChangedPath);
		if(this.filesChanged === 0 && !this.hasFileChangesLock){
			this.buildLock.lock();
			this.hasFileChangesLock = true;
			logDebug("Lock level on FS object change: " + this.buildLock.getLockLevel());
		}
		this.filesChanged++;
	}

	/** запуститься в вотчмоде */
	async startWatch(){
		await this.beforeStart();

		let system = this.createSystemForWatch();
		let watchHost = this.createWatchHost(system);
		this._host = tsc.createCompilerHost(this.tscConfig.options);
		let watchProgram = tsc.createWatchProgram(watchHost);
		this._watch = watchProgram;

		processTypescriptDiagnostics(tsc.getPreEmitDiagnostics(this.program));
	}

	async stopWatch(){
		if(!this._watch){
			throw new Error("Could not stop watchmode if watchmode is not started.");
		}
		this._watch.close();
		this._watch = null;
	}

	/** Запуститься для разовой компиляции */
	async runSingle(){
		await this.beforeStart();

		this._host = tsc.createCompilerHost(this.tscConfig.options);
		this._program = tsc.createProgram({
			...this.tscConfig,
			host: this._host
		});
		
		processTypescriptDiagnostics(tsc.getPreEmitDiagnostics(this.program));

		let emitResult = this.program.emit(undefined, undefined, undefined, undefined, this.createTransformers());
		processTypescriptDiagnostics(emitResult.diagnostics);
	}

}