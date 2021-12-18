import {LoggerImpl} from "impl/logger"
import {Imploder} from "imploder"
import * as tsc from "typescript"
import * as path from "path"

export function typescriptDiagnosticEntryToString(d: tsc.Diagnostic, projectRoot?: string): string {
	let origin = ""
	if(d.file){
		origin = d.file.fileName
		if(path.isAbsolute(origin) && projectRoot && origin.startsWith(projectRoot)){
			// let's make paths shorter - it will look prettier in the output
			origin = path.relative(projectRoot, origin)
		}

		if(typeof(d.start) === "number"){
			let {line, character} = d.file.getLineAndCharacterOfPosition(d.start)
			origin += ` (${line + 1}:${character + 1})`
		}
	}

	return `${origin} ${tsc.DiagnosticCategory[d.category]}: ${tsc.flattenDiagnosticMessageText(d.messageText, "\n")}`
}

export function processTypescriptDiagnosticEntry(d: tsc.Diagnostic, logger?: Imploder.Logger, projectRoot?: string): boolean {
	let msgString = typescriptDiagnosticEntryToString(d, projectRoot)
	if(!logger){
		LoggerImpl.writeDefault(msgString)
	} else if(d.category === tsc.DiagnosticCategory.Error){
		logger.error(msgString)
	} else if(d.category === tsc.DiagnosticCategory.Warning){
		logger.warn(msgString)
	} else {
		logger.info(msgString)
	}

	return d.category === tsc.DiagnosticCategory.Error
}

export function processTypescriptDiagnostics(diagnostics?: Iterable<tsc.Diagnostic> | null, logger?: Imploder.Logger, projectRoot?: string): boolean {
	let haveErrors = false
	for(let d of diagnostics || []){
		haveErrors = haveErrors || processTypescriptDiagnosticEntry(d, logger, projectRoot)
	}
	return haveErrors
}