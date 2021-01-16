import {Imploder} from "imploder";
import {ImploderWatchCompiler} from "impl/compilers/watch_compiler";
/*
import * as tsc from "typescript";
import {processTypescriptDiagnostics} from "utils/tsc_diagnostics";

export class ImploderSingleRunCompiler extends ImploderAbstractCompiler implements Imploder.Compiler {
	private _program: tsc.Program | null = null;
	get program(): tsc.Program {
		if(this._program){
			return this._program;
		}
		throw new Error("Compiler not started yet.");
	}

	async run(){
		await this.beforeStart();
		this.clearLastBuildDiagnostics();

		this._host = tsc.createCompilerHost(this.tscConfig.options);
		this._program = tsc.createProgram({
			...this.tscConfig,
			host: this._host
		});

		let preEmitDiag = tsc.getPreEmitDiagnostics(this.program);
		this.lastBuildDiag.push(...preEmitDiag);
		if(!this.context.config.noBuildDiagnosticMessages){
			processTypescriptDiagnostics(preEmitDiag);
		}

		let transformers = await this.context.transformerController.getTransformers();
		let emitResult = this.program.emit(undefined, undefined, undefined, undefined, transformers);

		this.lastBuildDiag.push(...emitResult.diagnostics);
		if(!this.context.config.noBuildDiagnosticMessages){
			processTypescriptDiagnostics(emitResult.diagnostics);
		}
		this.updateErrorCount();
	}

}*/


export class ImploderSingleRunCompiler extends ImploderWatchCompiler implements Imploder.Compiler {
	protected shouldInstallFsWatchers(): boolean {
		return false;
	}

	async run(){
		// да, в итоге оказалось проще имплементировать одиночную компиляцию через watch-компиляцию
		// это дает более консистентные результаты
		do {
			// зачем в цикле?
			// это позволяет поддерживать трансформеры, которые генерируют код
			// т.о. в первый цикл трансформер генерирует файл и дергает за notifyFsObjectChange
			// мы это видим по тому, что buildLock не снят
			// и запускаем сборку по новой
			await super.run();
			this.stopWatch();
		} while(this.buildLock.isLocked());
	}

}