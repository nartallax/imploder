import {runAllTests, runSingleTest} from "test/test";
import {logErrorAndExit, setLogVerbosityLevel} from "utils/log";
import {updateCliArgsWithTsconfig, parseToolCliArgs} from "impl/config";
import {CLI} from "utils/cli";
import {TSToolContextImpl} from "impl/context";

export async function tstoolMain(){
	let cliArgs = parseToolCliArgs(CLI.processArgvWithoutExecutables);

	if(cliArgs.verbose){
		setLogVerbosityLevel(1);
	}

	if(cliArgs.test){
		await runAllTests();
		return;
	}

	if(cliArgs.testSingle){
		await runSingleTest(cliArgs.testSingle);
		return
	}

	if(!cliArgs.tsconfigPath){
		logErrorAndExit("Path to tsconfig.json is not passed. Could not start bundler.");
	}


	let config = updateCliArgsWithTsconfig(cliArgs);
	let context = new TSToolContextImpl(config);
	if(!config.watchMode){
		await context.compiler.run();
		await context.bundler.produceBundle();
	} else {
		await context.compiler.run();
		if(config.useStdio){
			// TODO: stdio interface
		}
		if(typeof(config.httpPort) === "number"){
			// TODO: http interface
		}
	}

}