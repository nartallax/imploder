import {updateCliArgsWithTsconfig} from "impl/config";
import {HttpApi} from "impl/http_api";
import {Imploder} from "imploder";

export class ImploderContextImpl implements Imploder.Context {
	static createBundler?: (context: Imploder.Context) => Imploder.Bundler;
	static createCompiler?: (context: Imploder.Context) => Imploder.Compiler;
	static createPathResolver?: (context: Imploder.Context) => Imploder.ModulePathResolver;
	static createTransformerController?: (context: Imploder.Context) => Imploder.TransformerController;
	static createLogger?: (context: Imploder.Context) => Imploder.Logger;
	static createStdoutNotificator?: (context: Imploder.Context) => Imploder.StdoutNotificator;
	static createModuleStorage?: (context: Imploder.Context) => Imploder.ModuleStorage;

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

	private _logger?: Imploder.Logger;
	get logger(): Imploder.Logger {
		return this._logger ||= this.createOrThrow(ImploderContextImpl.createLogger);
	}

	private _moduleStorage?: Imploder.ModuleStorage;
	get moduleStorage(): Imploder.ModuleStorage {
		return this._moduleStorage ||= this.createOrThrow(ImploderContextImpl.createModuleStorage);
	}

	private _httpApi?: Imploder.HttpApi | null;
	get httpApi(): Imploder.HttpApi | null{
		if(this._httpApi === undefined){
			this._httpApi = typeof(this.config.httpPort) === "number"? new HttpApi(this): null;
		}
		return this._httpApi;
	}

	private _stdoutNotificator?: Imploder.StdoutNotificator;
	get stdoutNotificator(): Imploder.StdoutNotificator {
		return this._stdoutNotificator ||= this.createOrThrow(ImploderContextImpl.createStdoutNotificator);
	}

	async stopEverything(): Promise<void> {
		await Promise.all([
			Promise.resolve(!this._compiler? null: this._compiler.stop()),
			Promise.resolve(!this._httpApi? null: this._httpApi.stop())
		]);	
	}

}