import {TSToolContext} from "impl/context";
import * as tsc from "typescript";
import {AfterJsBundlerTransformer} from "./after_js_transformer";
import {BeforeJsBundlerTransformer} from "./before_js_transformer";

export interface TransformerController {
	getTransformers(): tsc.CustomTransformers;
}

export class TransformerControllerImpl implements TransformerController {

	constructor(private readonly context: TSToolContext){}

	private _transformers: tsc.CustomTransformers | null = null;
	getTransformers(): tsc.CustomTransformers{
		return this._transformers ||= this.createTransformers();
	}

	private createTransformers(): tsc.CustomTransformers {
		return {
			before: [
				//... more custom transformers here
				context => new BeforeJsBundlerTransformer(context, this.context),
			],
			after: [
				context => new AfterJsBundlerTransformer(context, this.context)
			]
		}
	}


}