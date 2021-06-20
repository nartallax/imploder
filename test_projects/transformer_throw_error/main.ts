import {Imploder} from "../../target/imploder";
import * as tsc from "typescript";


class ErrorThrowingTransformer implements Imploder.CustomTransformerDefinition {
	readonly transformerName = "error_throwing_transformer";

	constructor(private readonly toolContext: Imploder.Context){}

	createForBefore(transformContext: tsc.TransformationContext): tsc.CustomTransformer {
		return {
			transformSourceFile: (file: tsc.SourceFile): tsc.SourceFile => {
				throw new Error("I don't like this whole file!");
			},
			transformBundle(node: tsc.Bundle): tsc.Bundle { return node }
		}
	}
}

export function main(toolContext: Imploder.Context): Imploder.TransformerProjectEntryPointReturnType {
	return new ErrorThrowingTransformer(toolContext);
}