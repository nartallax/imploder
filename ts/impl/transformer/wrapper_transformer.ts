import {Imploder} from "imploder";
import * as tsc from "typescript";

export class WrapperTransformer implements tsc.CustomTransformer {

	constructor(
		private readonly onError: Imploder.TransformerErrorHandler,
		private readonly base: (file: tsc.SourceFile) => tsc.SourceFile,
		private readonly ref: Imploder.TransformerReference
		){}

	transformSourceFile(node: tsc.SourceFile): tsc.SourceFile {
		try {
			return this.base.call(null, node);
		} catch(e){
			this.onError(e, this.ref, node);
			return node;
		}
	}

	transformBundle(node: tsc.Bundle): tsc.Bundle {
		return node;
	}

}