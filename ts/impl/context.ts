import {updateCliArgsWithTsconfig} from "impl/config";
import {ModuleStorageImpl} from "impl/module_storage";
import * as TSTool from "tstool";

export class TSToolContextImpl implements TSTool.Context {
	static createBundler?: (context: TSTool.Context) => TSTool.Bundler;
	static createCompiler?: (context: TSTool.Context) => TSTool.Compiler;
	static createPathResolver?: (context: TSTool.Context) => TSTool.ModulePathResolver;
	static createTransformerController?: (context: TSTool.Context) => TSTool.TransformerController;

	readonly moduleStorage = new ModuleStorageImpl();

	private createOrThrow<T>(fn?: (context: TSTool.Context) => T): T {
		if(!fn){
			throw new Error("Creation function is not supplied.");
		}
		return fn(this);
	}

	static fromTsconfigPath(tsconfigPath: string): TSTool.Context {
		let config = updateCliArgsWithTsconfig({ tsconfigPath })
		return new TSToolContextImpl(config);
	}

	constructor(readonly config: TSTool.Config){}

	private _bundler?: TSTool.Bundler;
	get bundler(): TSTool.Bundler {
		return this._bundler ||= this.createOrThrow(TSToolContextImpl.createBundler);
	}

	private _compiler?: TSTool.Compiler;
	get compiler(): TSTool.Compiler {
		return this._compiler ||= this.createOrThrow(TSToolContextImpl.createCompiler);
	}

	private _modulePathResolver?: TSTool.ModulePathResolver;
	get modulePathResolver(): TSTool.ModulePathResolver {
		return this._modulePathResolver ||= this.createOrThrow(TSToolContextImpl.createPathResolver);
	}

	private _transformerController?: TSTool.TransformerController;
	get transformerController(): TSTool.TransformerController {
		return this._transformerController ||= this.createOrThrow(TSToolContextImpl.createTransformerController);
	}

}