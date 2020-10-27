import {Bundler, BundlerImpl} from "impl/bundler";
import {TSToolCompiler} from "impl/compilers/compiler";
import {TSToolSingleRunCompiler} from "impl/compilers/single_run_compiler";
import {TSToolWatchCompiler} from "impl/compilers/watch_compiler";
import {TSToolConfig} from "impl/config";
import {ModulePathResolver, ModulePathResolverImpl} from "impl/module_path_resolver";
import {ModuleStorage, ModuleStorageImpl} from "impl/module_storage";
import {TransformerController, TransformerControllerImpl} from "transformer/transformer_controller";

export interface TSToolContext {
	readonly config: TSToolConfig;
	readonly bundler: Bundler;
	readonly compiler: TSToolCompiler;
	readonly moduleStorage: ModuleStorage;
	readonly modulePathResolver: ModulePathResolver;
	readonly transformerController: TransformerController;
}

export class TSToolContextImpl implements TSToolContext {
	readonly moduleStorage = new ModuleStorageImpl();

	constructor(readonly config: TSToolConfig){}

	private _bundler?: Bundler;
	get bundler(): Bundler {
		return this._bundler ||= new BundlerImpl(this);
	}

	private _compiler?: TSToolCompiler;
	get compiler(): TSToolCompiler {
		return this._compiler ||= this.config.watchMode? new TSToolWatchCompiler(this): new TSToolSingleRunCompiler(this);
	}

	private _modulePathResolver?: ModulePathResolver;
	get modulePathResolver(): ModulePathResolver {
		return this._modulePathResolver ||= new ModulePathResolverImpl(this);
	}

	private _transformerController?: TransformerController;
	get transformerController(): TransformerController {
		return this._transformerController ||= new TransformerControllerImpl(this);
	}

}