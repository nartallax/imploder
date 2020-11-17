import {updateCliArgsWithTsconfig} from "impl/config";
import {ModuleStorageImpl} from "impl/module_storage";
import * as Imploder from "imploder";

export class ImploderContextImpl implements Imploder.Context {
	static createBundler?: (context: Imploder.Context) => Imploder.Bundler;
	static createCompiler?: (context: Imploder.Context) => Imploder.Compiler;
	static createPathResolver?: (context: Imploder.Context) => Imploder.ModulePathResolver;
	static createTransformerController?: (context: Imploder.Context) => Imploder.TransformerController;

	readonly moduleStorage = new ModuleStorageImpl();

	private createOrThrow<T>(fn?: (context: Imploder.Context) => T): T {
		if(!fn){
			throw new Error("Creation function is not supplied.");
		}
		return fn(this);
	}

	static fromTsconfigPath(tsconfigPath: string): Imploder.Context {
		let config = updateCliArgsWithTsconfig({ tsconfigPath })
		return new ImploderContextImpl(config);
	}

	constructor(readonly config: Imploder.Config){}

	private _bundler?: Imploder.Bundler;
	get bundler(): Imploder.Bundler {
		return this._bundler ||= this.createOrThrow(ImploderContextImpl.createBundler);
	}

	private _compiler?: Imploder.Compiler;
	get compiler(): Imploder.Compiler {
		return this._compiler ||= this.createOrThrow(ImploderContextImpl.createCompiler);
	}

	private _modulePathResolver?: Imploder.ModulePathResolver;
	get modulePathResolver(): Imploder.ModulePathResolver {
		return this._modulePathResolver ||= this.createOrThrow(ImploderContextImpl.createPathResolver);
	}

	private _transformerController?: Imploder.TransformerController;
	get transformerController(): Imploder.TransformerController {
		return this._transformerController ||= this.createOrThrow(ImploderContextImpl.createTransformerController);
	}

}