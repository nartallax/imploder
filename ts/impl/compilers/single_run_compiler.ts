import {TSToolAbstractCompiler, TSToolCompiler} from "impl/compilers/compiler";
import * as tsc from "typescript";
import {processTypescriptDiagnostics} from "utils/tsc_diagnostics";

export class TSToolSingleRunCompiler extends TSToolAbstractCompiler implements TSToolCompiler {
	private _program: tsc.Program | null = null;
	get program(): tsc.Program {
		if(this._program){
			return this._program;
		}
		throw new Error("Compiler not started yet.");
	}

	async run(){
		await this.beforeStart();

		this._host = tsc.createCompilerHost(this.tscConfig.options);
		this._program = tsc.createProgram({
			...this.tscConfig,
			host: this._host
		});
		
		processTypescriptDiagnostics(tsc.getPreEmitDiagnostics(this.program));

		let emitResult = this.program.emit(undefined, undefined, undefined, undefined, this.context.transformerController.getTransformers());
		processTypescriptDiagnostics(emitResult.diagnostics);
	}

}