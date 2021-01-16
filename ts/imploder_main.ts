import {runAllTests, runSingleTest} from "test/test";
import {LoggerImpl} from "impl/logger";
import {updateCliArgsWithTsconfig, parseToolCliArgs, updatePartialConfigWithTsconfig} from "impl/config";
import {CLI} from "utils/cli";
import {ImploderContextImpl} from "impl/context";
import {ImploderWatchCompiler} from "impl/compilers/watch_compiler";
import {ImploderSingleRunCompiler} from "impl/compilers/single_run_compiler";
import {TransformerControllerImpl} from "impl/transformer/transformer_controller";
import {BundlerImpl} from "impl/bundler";
import {ModulePathResolverImpl} from "impl/module_path_resolver";
import {HttpApi} from "impl/http_api";
import {ModuleStorageImpl} from "impl/module_storage";
import {Imploder} from "imploder";


ImploderContextImpl.createCompiler = context => context.config.watchMode
	? new ImploderWatchCompiler(context)
	: new ImploderSingleRunCompiler(context)

ImploderContextImpl.createTransformerController = context => new TransformerControllerImpl(context);
ImploderContextImpl.createBundler = context => new BundlerImpl(context);
ImploderContextImpl.createPathResolver = context => new ModulePathResolverImpl(context);
ImploderContextImpl.createLogger = context => new LoggerImpl(context.config);
ImploderContextImpl.createModuleStorage = context => new ModuleStorageImpl(context);

export async function runAsCli(){
	let cliArgs = parseToolCliArgs(CLI.processArgvWithoutExecutables);

	if(cliArgs.test){
		await runAllTests(cliArgs);
		return;
	}

	if(cliArgs.testSingle){
		await runSingleTest(cliArgs.testSingle, cliArgs);
		return
	}

	if(!cliArgs.tsconfigPath){
		LoggerImpl.writeDefaultAndExit("Path to tsconfig.json is not passed. Could not start bundler.");
	}


	let config = updateCliArgsWithTsconfig(cliArgs);
	
	await runFromConfig(config);
}

export async function runFromTsconfig(tsconfigPath: string, overrides?: Partial<Imploder.Config>){
	let config = updatePartialConfigWithTsconfig(tsconfigPath, overrides || {});
	await runFromConfig(config);
}

export async function runFromConfig(config: Imploder.Config){
	let context = new ImploderContextImpl(config);
	if(!config.watchMode){
		context.logger.info("Starting to build project.");
		await context.compiler.run();
		if(context.compiler.lastBuildWasSuccessful){
			await context.bundler.produceBundle();
			context.logger.info("Done.");
		} else {
			context.logger.error("Done; bundle was not produced as build was not successful.");
		}
	} else {
		context.logger.info("Starting initial build.");
		await context.compiler.run();
		if(typeof(config.httpPort) === "number"){
			await new HttpApi(context).start();
		}
		context.logger.info("Up and running.");
	}
}