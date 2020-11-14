import * as tsc from "typescript";
import * as TSTool from "tstool";
import {processTypescriptDiagnosticEntry} from "utils/tsc_diagnostics";
import {logInfo, logError, logDebug, logWarn} from "utils/log";
import {Lock} from "utils/lock";
import {TSToolAbstractCompiler} from "impl/compilers/compiler";


export class TSToolWatchCompiler extends TSToolAbstractCompiler implements TSTool.Compiler {
	readonly buildLock = new Lock();

	private _watch: tsc.Watch<tsc.BuilderProgram> | null = null;
	private _builderProgram: tsc.BuilderProgram | null = null;
	get program(): tsc.Program {
		if(this._watch){
			return this._watch.getProgram().getProgram();
		}
		if(this._builderProgram){
			return this._builderProgram.getProgram();
		}
		throw new Error("Compiler not started yet.");
	}

	protected shouldInstallFsWatchers(): boolean {
		return true;
	}

	// создать экземпляр tsc.System для работы в вотчмоде
	private createSystemForWatch(): tsc.System {
		const watchFile = tsc.sys.watchFile;
		const watchDir = tsc.sys.watchDirectory;

		return {
			...tsc.sys,
			watchFile: !watchFile || !this.shouldInstallFsWatchers()? undefined:
				(path, callback, pollingInterval, options) => watchFile.call(tsc.sys, path, (fileName, kind) => {
					let module = this.context.modulePathResolver.getCanonicalModuleName(fileName);
					this.context.moduleStorage.delete(module);
					if(kind === tsc.FileWatcherEventKind.Deleted){
						this.context.transformerController.onModuleDelete(module);
					}
					if(this._watch){
						callback(fileName, kind);
						this.notifyFsObjectChange(fileName);
					}
				}, pollingInterval, options),
			watchDirectory: !watchDir || !this.shouldInstallFsWatchers()? undefined: 
				(path, callback, recursive, options) => watchDir.call(tsc.sys, path, (fileName: string) => {
					if(this._watch){
						callback(fileName);
						// не берем здесь лок, т.к. за изменением только директории не всегда следует компиляция
						// если мы возьмем здесь лок из-за изменений файлов, то потом разлочимся неизвестно когда
						//this.notifyFsObjectChange(fileName);
					}
				}, recursive, options)
		}
	}

	private async createWatchHost(system: tsc.System){
		let transformers = await this.context.transformerController.getTransformers();

		// зачем такие сложности, с созданием двух хостов?
		// первый хост нужен для того, чтобы вызывать на нем createProgram
		// смысл в том, что обычно createProgram будет чем-то вроде createEmitAndSemanticDiagnosticsBuilderProgram
		// но я не хочу это хардкодить. поэтому я получаю её таким вот непрямым путем
		// в худшем случае, при изменениях тул перестанет компилиться/работать
		let defaultHost = tsc.createWatchCompilerHost(
			this.context.config.tsconfigPath,
			this.context.config.tscParsedCommandLine.options,
			system,
			undefined,
			processTypescriptDiagnosticEntry,
			(diagnostic: tsc.Diagnostic) => {
				logError("DEFAULT HOST EMITTED DIAG!");
				processTypescriptDiagnosticEntry(diagnostic);
			}
		)

		return tsc.createWatchCompilerHost(
			this.context.config.tsconfigPath,
			this.context.config.tscParsedCommandLine.options,
			system,
			(rootNames, options, host, oldProgram, configFileParsingDiagnostics, projectReferences) => {
				// подменять createProgram нужно для того, чтобы можно было подсовывать произвольные трансформеры в его emit
				let result = defaultHost.createProgram(rootNames, options, host, oldProgram, configFileParsingDiagnostics, projectReferences);
				let origEmit = result.emit;
				
				this._builderProgram = result;

				result.emit = (targetSourceFile, writeFile, cancellationToken, emitOnlyDtsFiles, customTransformers) => {
					this.startBuild();

					// возможно, это избыточно?
					for(let diag of tsc.getPreEmitDiagnostics(result.getProgram())){
						this.onDiag(diag);
					}

					try {
						return origEmit.call(result, 
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
				}
				return result;
			},
			diag => this.onDiag(diag),
			diag => {
				if(diag.code === 6031 || diag.code === 6032){
					// build started, skipping
				} else if(diag.code === 6193 || diag.code === 6194){
					// build ended, skipping
				} else {
					processTypescriptDiagnosticEntry(diag);
				}
			}
		);
	}

	private onDiag(diag: tsc.Diagnostic){
		this.lastBuildDiag.push(diag);
		if(!this.context.config.noBuildDiagnosticMessages){
			processTypescriptDiagnosticEntry(diag);
		}
	}

	private hasFileChangesLock = false;
	private filesChanged = 0;
	private startBuild(){
		this.buildLock.lock();
		this.clearLastBuildDiagnostics();
		this.filesChanged = 0;
		logDebug("Build started.");
	}

	private endBuild(){
		this.updateErrorCount();
		if(this.filesChanged !== 0){
			let logger = this.context.config.noBuildDiagnosticMessages? logDebug: logInfo;
			logger(`Build ended, errors: ${this.errorCount} (but soon new one will start, files changed since build start = ${this.filesChanged})`);
		} else {
			let logger = this.errorCount === 0 || this.context.config.noBuildDiagnosticMessages? logDebug: logWarn;
			logger(`Build ended, errors: ${this.errorCount}`);
			if(this.hasFileChangesLock){
				this.hasFileChangesLock = false;
				this.buildLock.unlock();
			}
			logDebug("Lock level after build end: " + this.buildLock.getLockLevel());
		}
		this.buildLock.unlock();
	}

	notifyFsObjectChange(fsObjectChangedPath: string): void {
		logDebug("FS object change: " + fsObjectChangedPath);
		if(this.filesChanged === 0 && !this.hasFileChangesLock){
			this.buildLock.lock();
			this.hasFileChangesLock = true;
			logDebug("Lock level on FS object change: " + this.buildLock.getLockLevel());
		}
		this.filesChanged++;
	}

	/** запуститься в вотчмоде */
	async run(){
		await this.beforeStart();

		let system = this.createSystemForWatch();
		let watchHost = await this.createWatchHost(system);
		this._host = tsc.createCompilerHost(this.context.config.tscParsedCommandLine.options);
		let watchProgram = tsc.createWatchProgram(watchHost);
		this._watch = watchProgram;
	}

	stopWatch(){
		if(!this._watch){
			throw new Error("Could not stop watchmode if watchmode is not started.");
		}
		this._watch.close();
		this._watch = null;
	}

	waitBuildEnd(): Promise<void>{
		return new Promise(ok => {
			// таймаут здесь нужен потому, что вотчеры файловой системы могут сработать не мгновенно
			// и поэтому нужно хотя бы немного подождать, пока они отработают и запустят процесс билда
			// это ненадежно, но более надежного способа у меня нет
			setTimeout(() => {
				this.buildLock.withLock(ok);
			}, 500);
		});
	}
}