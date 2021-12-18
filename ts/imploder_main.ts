import {runAllTests, runSingleTest} from "test/test"
import {LoggerImpl} from "impl/logger"
import {updateCliArgsWithTsconfig, parseToolCliArgs, updatePartialConfigWithTsconfig} from "impl/config"
import {CLI} from "utils/cli"
import {ImploderContextImpl} from "impl/context"
import {ImploderWatchCompiler} from "impl/compilers/watch_compiler"
import {ImploderSingleRunCompiler} from "impl/compilers/single_run_compiler"
import {TransformerControllerImpl} from "impl/transformer/transformer_controller"
import {BundlerImpl} from "impl/bundler"
import {ModulePathResolverImpl} from "impl/module_path_resolver"
import {ModuleStorageImpl} from "impl/module_storage"
import {Imploder} from "imploder"
import {StdoutNotificatorImpl} from "impl/stdout_notificator"
export {updatePartialConfigWithTsconfig} from "impl/config"


ImploderContextImpl.createCompiler = context => context.config.watchMode
	? new ImploderWatchCompiler(context)
	: new ImploderSingleRunCompiler(context)

ImploderContextImpl.createTransformerController = context => new TransformerControllerImpl(context)
ImploderContextImpl.createBundler = context => new BundlerImpl(context)
ImploderContextImpl.createPathResolver = context => new ModulePathResolverImpl(context)
ImploderContextImpl.createLogger = context => new LoggerImpl(context.config)
ImploderContextImpl.createStdoutNotificator = context => new StdoutNotificatorImpl(context)
ImploderContextImpl.createModuleStorage = context => new ModuleStorageImpl(context)

export async function runAsCli(): Promise<void> {
	try {
		let cliArgs = parseToolCliArgs(CLI.processArgvWithoutExecutables)

		if(cliArgs.test){
			await runAllTests(cliArgs)
			return
		}

		if(cliArgs.testSingle){
			await runSingleTest(cliArgs.testSingle, cliArgs)
			return
		}

		if(!cliArgs.tsconfigPath){
			LoggerImpl.writeDefaultAndExit("Path to tsconfig.json is not passed. Could not start bundler.")
		}


		let config = updateCliArgsWithTsconfig(cliArgs)

		let context = await runFromConfig(config)

		if(!context.config.watchMode){
			process.exit(context.compiler.lastBuildWasSuccessful ? 0 : 1)
		}
	} catch(e){
		console.error((e as Error).stack || (e as Error).message || e)
		process.exit(1)
	}
}

export function runFromTsconfig(tsconfigPath: string, overrides?: Partial<Imploder.Config>): Promise<Imploder.Context> {
	let config = updatePartialConfigWithTsconfig(tsconfigPath, overrides || {})
	return runFromConfig(config)
}

export async function runFromConfig(config: Imploder.Config): Promise<Imploder.Context> {
	let context = new ImploderContextImpl(config)
	if(!config.watchMode){
		context.logger.info("Starting to build project.")
		await context.compiler.run()
		if(context.compiler.lastBuildWasSuccessful){
			await context.bundler.produceBundle()
			context.logger.info("Done.")
		} else {
			context.logger.error("Done; bundle was not produced as build was not successful.")
		}
	} else {
		if(!context.config.lazyStart){
			context.logger.info("Starting initial build.")
			await context.compiler.run()
		}
		if(context.httpApi){
			await context.httpApi.start()
		}
		context.logger.info("Imploder started.")
		context.stdoutNotificator.started()
	}

	return context
}

export function isContext(smth: unknown): smth is Imploder.Context {
	return typeof(smth) === "object" && !!smth && smth instanceof ImploderContextImpl
}
