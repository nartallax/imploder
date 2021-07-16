import {Imploder} from "imploder";
import * as Tsc from "typescript";

export class WrapperTransformer implements Tsc.CustomTransformer {

	constructor(
		private readonly onError: Imploder.TransformerErrorHandler,
		private readonly base: (file: Tsc.SourceFile) => Tsc.SourceFile,
		private readonly ref: Imploder.TransformerReference
		){}

	transformSourceFile(node: Tsc.SourceFile): Tsc.SourceFile {
		try {
			return this.base.call(null, node);
		} catch(e){
			this.onError(e, this.ref, node);
			return node;
		}
	}

	transformBundle(node: Tsc.Bundle): Tsc.Bundle {
		return node;
	}

}