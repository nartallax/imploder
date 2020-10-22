import * as tsc from "typescript";
import {logError, logWarn, logInfo} from "log";

export function processTypescriptDiagnosticEntry(d: tsc.Diagnostic): boolean {
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

	let msgString = msg.map(_ => _ && _.trim()).filter(_ => !!_).join(" ");
	if(d.category == tsc.DiagnosticCategory.Error){
		logError(msgString)
		return true;
	} else if(d.category === tsc.DiagnosticCategory.Warning) {
		logWarn(msgString);
	} else {
		logInfo(msgString);
	}

	return false;
}

export function processTypescriptDiagnostics(diagnostics?: Iterable<tsc.Diagnostic> | null){
	let haveErrors = false;
    for(let d of diagnostics || []) {
		haveErrors = haveErrors || processTypescriptDiagnosticEntry(d);
	}
	
	if(haveErrors){
		process.exit(1)
	}
}