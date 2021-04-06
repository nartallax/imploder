import * as tsc from "typescript";
import * as path from "path";
import {unlinkRecursive, fileExists, mkdir} from "utils/afs";
import {Imploder} from "imploder";
import {SeqSet} from "utils/seq_set";

/*
Полезные доки и примеры: 
https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
https://basarat.gitbook.io/typescript/overview/
https://www.typescriptlang.org/docs/handbook/module-resolution.html
https://stackoverflow.com/questions/62026189/typescript-custom-transformers-with-ts-createwatchprogram
*/

export abstract class ImploderAbstractCompiler {
	protected readonly tscConfig: tsc.ParsedCommandLine & { rootNames: string[] };
	readonly projectRoot = path.dirname(this.context.config.tsconfigPath);

	constructor(protected readonly context: Imploder.Context){
		this.tscConfig = {
			...this.context.config.tscParsedCommandLine,
			rootNames: [this.projectRoot + "/"]
		}
	}

	protected async beforeStart(){
		const outDir = this.context.config.tscParsedCommandLine.options.outDir;
		if(!this.context.config.preserveOutDir && outDir){
			if(await fileExists(outDir)){
				await unlinkRecursive(outDir);
				// создавать тут директорию нужно для вотчмода
				// потому что иначе он сразу же после начала работы дергается на свежесозданную директорию с выходными данными
				// это не очень страшно, но неприятно
				await mkdir(outDir);
			}
		}
	}

	protected _host: tsc.CompilerHost | null = null;
	get compilerHost(): tsc.CompilerHost {
		if(!this._host){
			throw new Error("Compiler not started, no compiler host available.");
		}
		return this._host;
	}

	protected errorCount = 0;
	protected lastBuildDiag = new SeqSet<tsc.Diagnostic>(d => {
		return (!d.file? "<nofile>": d.file.fileName) + "|" +
			(d.start || -1) + "|" + 
			(d.length || -1) + "|" + 
			(d.messageText || -1);
	});
	get lastBuildDiagnostics(): ReadonlyArray<tsc.Diagnostic>{
		return this.lastBuildDiag.seq;
	}

	protected clearLastBuildDiagnostics(){
		this.errorCount = 0;
		this.lastBuildDiag.clear();
	}

	protected updateErrorCount(){
		this.errorCount = this.lastBuildDiag.seq.filter(_ => _.category === tsc.DiagnosticCategory.Error).length;
	}

	get lastBuildWasSuccessful(): boolean {
		return this.errorCount === 0
	}

}