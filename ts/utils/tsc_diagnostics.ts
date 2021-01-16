import {LoggerImpl} from "impl/logger";
import {Imploder} from "imploder";
import * as tsc from "typescript";

export function typescriptDiagnosticEntryToString(d: tsc.Diagnostic): string {
	let msg: (string | null)[] = [];

	if(d.file) {
		let origin = d.file.fileName;

		if(typeof(d.start) === "number"){
			let { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
			origin += ` (${line + 1}:${character + 1})`;
		}

		msg.push(origin);
	}
	
	msg.push(tsc.DiagnosticCategory[d.category] + ":")
	msg.push(tsc.flattenDiagnosticMessageText(d.messageText, '\n'));
	//msg.push(d.code.toString());

	return msg.map(_ => _ && _.trim()).filter(_ => !!_).join(" ");
}

export function processTypescriptDiagnosticEntry(d: tsc.Diagnostic, logger?: Imploder.Logger): boolean {
	let msgString = typescriptDiagnosticEntryToString(d);
	if(!logger){
		LoggerImpl.writeDefault(msgString);
	} else if(d.category === tsc.DiagnosticCategory.Error){
		logger.error(msgString)
	} else if(d.category === tsc.DiagnosticCategory.Warning) {
		logger.warn(msgString);
	} else {
		logger.info(msgString);
	}

	return d.category === tsc.DiagnosticCategory.Error;
}

export function processTypescriptDiagnostics(diagnostics?: Iterable<tsc.Diagnostic> | null, logger?: Imploder.Logger): boolean {
	let haveErrors = false;
    for(let d of diagnostics || []) {
		haveErrors = haveErrors || processTypescriptDiagnosticEntry(d, logger);
	}
	return haveErrors;
}