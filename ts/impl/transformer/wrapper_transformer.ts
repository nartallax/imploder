import {Imploder} from "imploder";
import * as tsc from "typescript";

export class WrapperTransformer implements tsc.CustomTransformer {

	constructor(
		private readonly onError: Imploder.TransformerErrorHandler,
		private readonly base: tsc.CustomTransformer,
		private readonly def: Imploder.CustomTransformerDefinition
		){}

	transformSourceFile(node: tsc.SourceFile): tsc.SourceFile {
		try {
			return this.base.transformSourceFile(node);
		} catch(e){
			this.onError(e, this.def, node);
			return node;
		}
	}

	transformBundle(node: tsc.Bundle): tsc.Bundle {
		try {
			return this.base.transformBundle(node);
		} catch(e){
			this.onError(e, this.def, node);
			return node;
		}
	}

}