import * as tsc from "typescript";
import * as path from "path";
import {unlinkRecursive, fileExists, mkdir} from "utils/afs";
import {TSToolContext} from "impl/context";

/*
Полезные доки и примеры: 
https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
https://basarat.gitbook.io/typescript/overview/
https://www.typescriptlang.org/docs/handbook/module-resolution.html
https://stackoverflow.com/questions/62026189/typescript-custom-transformers-with-ts-createwatchprogram
*/

/** обертка над компилятором tsc */
export interface TSToolCompiler {
	readonly program: tsc.Program;
	readonly compilerHost: tsc.CompilerHost;
	run(): Promise<void>;
}

export abstract class TSToolAbstractCompiler {
	protected readonly tscConfig: tsc.ParsedCommandLine & { rootNames: string[] };

	constructor(protected readonly context: TSToolContext){
		this.tscConfig = {
			...this.context.config.tscParsedCommandLine,
			rootNames: [path.resolve(path.dirname(this.context.config.tsconfigPath), this.context.config.entryModule)]
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

}