import {Imploder} from "../../target/imploder";
import * as tsc from "typescript";

export function main(toolContext: Imploder.Context) {
	return (_: tsc.TransformationContext) => (file: tsc.SourceFile): tsc.SourceFile => {
		toolContext.compiler.addDiagnostic({
			category: tsc.DiagnosticCategory.Warning,
			code: 1,
			file: file,
			start: 2,
			length: 1,
			messageText: "I don't like this character!",
		});
		toolContext.compiler.addDiagnostic({
			category: tsc.DiagnosticCategory.Error,
			code: 1,
			file: file,
			start: 3,
			length: 1,
			messageText: "This character is totally wrong!",
		});
		return file;
	}
}