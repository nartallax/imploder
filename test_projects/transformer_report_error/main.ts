import {Imploder} from "../../imploder";
import * as tsc from "typescript";


class ErrorReportingTransformer implements Imploder.CustomTransformerDefinition {
	readonly transformerName = "error_reporting_transformer";

	constructor(private readonly toolContext: Imploder.Context){}

	createForBefore(transformContext: tsc.TransformationContext): tsc.CustomTransformer {
		return {
			transformSourceFile: (file: tsc.SourceFile): tsc.SourceFile => {
				this.toolContext.compiler.addDiagnostic({
					category: tsc.DiagnosticCategory.Warning,
					code: 1,
					file: file,
					start: 2,
					length: 1,
					messageText: "I don't like this character!",
				});
				this.toolContext.compiler.addDiagnostic({
					category: tsc.DiagnosticCategory.Error,
					code: 1,
					file: file,
					start: 3,
					length: 1,
					messageText: "This character is totally wrong!",
				});
				return file;
			},
			transformBundle(node: tsc.Bundle): tsc.Bundle { return node }
		}
	}
}

export function main(toolContext: Imploder.Context): Imploder.TransformerProjectEntryPointReturnType {
	return new ErrorReportingTransformer(toolContext);
}