import * as tsc from "typescript";
import {Imploder} from "imploder";
import {processTypescriptDiagnosticEntry} from "utils/tsc_diagnostics";
import {Lock} from "utils/lock";
import {ImploderAbstractCompiler} from "impl/compilers/compiler";


export class ImploderWatchCompiler extends ImploderAbstractCompiler implements Imploder.Compiler {
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
		let transformers = await this.context.transformerController.createTransformers((err, ref, file) => {
			this.addDiagnostic({
				category: tsc.DiagnosticCategory.Error,
				code: 1,
				file: tsc.isSourceFile(file)? file: undefined,
				messageText: `Transformer ${ref.transform} throws error: ${err.message}`,
				start: undefined,
				length: undefined
			});
		});

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
			(diagnostic: tsc.Diagnostic) => {
				processTypescriptDiagnosticEntry(diagnostic, this.context.logger, this.projectRoot);
			},
			(diagnostic: tsc.Diagnostic) => {
				this.context.logger.error("DEFAULT HOST EMITTED DIAG!");
				processTypescriptDiagnosticEntry(diagnostic, this.context.logger, this.projectRoot);
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
						this.addDiagnostic(diag);
					}

					try {
						return origEmit.call(result, 
							targetSourceFile,
							writeFile,
							cancellationToken,
							emitOnlyDtsFiles,
							{
								before: [
									...(customTransformers?.before || []), 
									...(transformers.before || [])
								],
								after: [ 
									...(customTransformers?.after || []), 
									...(transformers.after || [])
								],
								afterDeclarations: [ 
									...(customTransformers?.afterDeclarations || []), 
									...(transformers.afterDeclarations || []) 
								],
							}
						)
					} finally {
						this.endBuild();
					}
				}
				return result;
			},
			diag => this.addDiagnostic(diag),
			diag => {
				if(diag.code === 6031 || diag.code === 6032){
					// build started, skipping
				} else if(diag.code === 6193 || diag.code === 6194){
					// build ended, skipping
				} else {
					processTypescriptDiagnosticEntry(diag, this.context.logger, this.projectRoot);
				}
			}
		);
	}

	addDiagnostic(diag: tsc.Diagnostic): void {
		if(this.lastBuildDiag.push(diag)){
			if(!this.context.config.noBuildDiagnosticMessages){
				processTypescriptDiagnosticEntry(diag, this.context.logger, this.projectRoot);
			}
		}
	}

	private hasFileChangesLock = false;
	private filesChanged = 0;
	private startBuild(){
		this.buildLock.lock();
		this.clearLastBuildDiagnostics();
		this.filesChanged = 0;
		this.context.logger.debug("Build started.");
	}

	private endBuild(){
		this.updateErrorCount();
		let logger = this.context.logger;
		let logFn = this.context.config.noBuildDiagnosticMessages? logger.debug.bind(logger): logger.info.bind(logger);
		if(this.filesChanged !== 0){
			logFn(`Build ended, errors: ${this.errorCount} (but soon new one will start, files changed since build start = ${this.filesChanged})`);
		} else {
			logFn(`Build ended, errors: ${this.errorCount}`);
			if(this.hasFileChangesLock){
				this.hasFileChangesLock = false;
				this.buildLock.unlock();
			}
			logger.debug("Lock level after build end: " + this.buildLock.getLockLevel());
		}
		this.buildLock.unlock();
	}

	notifyFsObjectChange(fsObjectChangedPath: string): void {
		this.context.logger.debug("FS object change: " + fsObjectChangedPath);
		if(this.filesChanged === 0 && !this.hasFileChangesLock){
			this.buildLock.lock();
			this.hasFileChangesLock = true;
			this.context.logger.debug("Lock level on FS object change: " + this.buildLock.getLockLevel());
		}
		this.filesChanged++;
	}

	/** запуститься в вотчмоде */
	async run(){
		if(this._watch){
			return;
		}
		await this.beforeStart();

		let system = this.createSystemForWatch();
		let watchHost = await this.createWatchHost(system);
		this._host = tsc.createCompilerHost(this.context.config.tscParsedCommandLine.options);
		let watchProgram = tsc.createWatchProgram(watchHost);
		this._watch = watchProgram;
	}

	stop(){
		if(!this._watch){
			return;
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