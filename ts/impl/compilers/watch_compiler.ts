import * as Tsc from "typescript"
import {Imploder} from "imploder"
import {processTypescriptDiagnosticEntry} from "utils/tsc_diagnostics"
import {Lock} from "utils/lock"
import {ImploderAbstractCompiler} from "impl/compilers/compiler"
import {FsWatchersController} from "impl/fs_watchers_controller"


export class ImploderWatchCompiler extends ImploderAbstractCompiler implements Imploder.Compiler {
	readonly buildLock = new Lock()

	private _watch: Tsc.Watch<Tsc.BuilderProgram> | null = null
	private _builderProgram: Tsc.BuilderProgram | null = null
	private fsWatcherController: FsWatchersController = new FsWatchersController(
		this.context,
		this.notifyFsObjectChange.bind(this),
		() => !!this._watch
	)

	get program(): Tsc.Program {
		if(this._watch){
			return this._watch.getProgram().getProgram()
		}
		if(this._builderProgram){
			return this._builderProgram.getProgram()
		}
		throw new Error("Compiler not started yet.")
	}

	get isStarted(): boolean {
		return !!this._watch || !!this._builderProgram
	}

	protected shouldInstallFsWatchers(): boolean {
		return true
	}

	// создать экземпляр tsc.System для работы в вотчмоде
	private createSystemForWatch(): Tsc.System {
		return {
			...Tsc.sys,
			watchFile: !this.shouldInstallFsWatchers() ? undefined : this.fsWatcherController.watchFile,
			watchDirectory: !this.shouldInstallFsWatchers() ? undefined : this.fsWatcherController.watchDirectory
		}
	}

	private async createWatchHost(system: Tsc.System) {
		let transformers = await this.context.transformerController.createTransformers((err, ref, file) => {
			this.addDiagnostic({
				category: Tsc.DiagnosticCategory.Error,
				code: 1,
				file: Tsc.isSourceFile(file) ? file : undefined,
				messageText: `Transformer ${ref.transform} throws error: ${err.message}`,
				start: undefined,
				length: undefined
			})
		})

		// зачем такие сложности, с созданием двух хостов?
		// первый хост нужен для того, чтобы вызывать на нем createProgram
		// смысл в том, что обычно createProgram будет чем-то вроде createEmitAndSemanticDiagnosticsBuilderProgram
		// но я не хочу это хардкодить. поэтому я получаю её таким вот непрямым путем
		// в худшем случае, при изменениях тул перестанет компилиться/работать
		// TODO: just use createProgram from actual host
		let defaultHost = Tsc.createWatchCompilerHost(
			this.context.config.tsconfigPath,
			this.context.config.tscParsedCommandLine.options,
			system,
			undefined,
			(diagnostic: Tsc.Diagnostic) => {
				processTypescriptDiagnosticEntry(diagnostic, this.context.logger, this.projectRoot)
			},
			(diagnostic: Tsc.Diagnostic) => {
				this.context.logger.error("DEFAULT HOST EMITTED DIAG!")
				processTypescriptDiagnosticEntry(diagnostic, this.context.logger, this.projectRoot)
			}
		)

		return Tsc.createWatchCompilerHost(
			this.context.config.tsconfigPath,
			this.context.config.tscParsedCommandLine.options,
			system,
			(rootNames, options, host, oldProgram, configFileParsingDiagnostics, projectReferences) => {
				// подменять createProgram нужно для того, чтобы можно было подсовывать произвольные трансформеры в его emit
				let result = defaultHost.createProgram(rootNames, options, host, oldProgram, configFileParsingDiagnostics, projectReferences)
				let origEmit = result.emit

				this._builderProgram = result

				result.emit = (targetSourceFile, writeFile, cancellationToken, emitOnlyDtsFiles, customTransformers) => {
					this.startBuild()

					// возможно, это избыточно?
					for(let diag of Tsc.getPreEmitDiagnostics(result.getProgram())){
						this.addDiagnostic(diag)
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
								]
							}
						)
					} finally {
						this.endBuild()
					}
				}
				return result
			},
			diag => this.addDiagnostic(diag),
			diag => {
				if(diag.code === 6031 || diag.code === 6032){
					// build started, skipping
				} else if(diag.code === 6193 || diag.code === 6194){
					// build ended, skipping
				} else {
					processTypescriptDiagnosticEntry(diag, this.context.logger, this.projectRoot)
				}
			}
		)
	}

	addDiagnostic(diag: Tsc.Diagnostic): void {
		if(this.lastBuildDiag.push(diag)){
			if(!this.context.config.noBuildDiagnosticMessages){
				processTypescriptDiagnosticEntry(diag, this.context.logger, this.projectRoot)
			}
		}
	}

	private hasFileChangesLock = false
	private filesChanged = 0
	private startBuild() {
		this.buildLock.lock()
		this.clearLastBuildDiagnostics()
		this.filesChanged = 0
		this.context.logger.debug("Build started.")
	}

	private endBuild() {
		this.updateErrorCount()
		let logger = this.context.logger
		let logFn = this.context.config.noBuildDiagnosticMessages ? logger.debug.bind(logger) : logger.info.bind(logger)
		if(this.filesChanged !== 0){
			logFn(`Build ended, errors: ${this.errorCount} (but soon new one will start, files changed since build start = ${this.filesChanged})`)
		} else {
			logFn(`Build ended, errors: ${this.errorCount}`)
			if(this.hasFileChangesLock){
				this.hasFileChangesLock = false
				this.buildLock.unlock()
			}
			logger.debug("Lock level after build end: " + this.buildLock.getLockLevel())
		}
		this.buildLock.unlock()
	}

	notifyFsObjectChange(fsObjectChangedPath: string): void {
		this.context.logger.debug("FS object change: " + fsObjectChangedPath)
		if(this.filesChanged === 0 && !this.hasFileChangesLock){
			this.buildLock.lock()
			this.hasFileChangesLock = true
			this.context.logger.debug("Lock level on FS object change: " + this.buildLock.getLockLevel())
		}
		this.filesChanged++
	}

	/** запуститься в вотчмоде */
	async run(): Promise<void> {
		if(this._watch){
			return
		}
		await this.beforeStart()

		let system = this.createSystemForWatch()
		let watchHost = await this.createWatchHost(system)
		this._host = Tsc.createCompilerHost(this.context.config.tscParsedCommandLine.options)
		let watchProgram = Tsc.createWatchProgram(watchHost)
		this._watch = watchProgram
	}

	stop(): void {
		if(this._watch){
			this._watch.close()
			this._watch = null
		}
		this.fsWatcherController.clear()
		if(this.shutdownTimeout){
			clearTimeout(this.shutdownTimeout)
			this.shutdownTimeout = null
		}
	}

	waitBuildEnd(): Promise<void> {
		return new Promise(ok => {
			// таймаут здесь нужен потому, что вотчеры файловой системы могут сработать не мгновенно
			// и поэтому нужно хотя бы немного подождать, пока они отработают и запустят процесс билда
			// это ненадежно, но более надежного способа у меня нет
			setTimeout(() => {
				this.buildLock.withLock(ok)
			}, 500)
		})
	}

	private shutdownTimeout: NodeJS.Timeout | null = null
	shutdownAfter(timeMsec: number): void {
		if(this.shutdownTimeout){
			clearTimeout(this.shutdownTimeout)
		}
		this.shutdownTimeout = setTimeout(() => {
			this.context.logger.info("Compiler idle for too long; shutting down.")
			this.stop()
		}, timeMsec)
	}

}