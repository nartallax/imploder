import {runAllTests, runSingleTest} from "test/test";
import {logErrorAndExit, setLogVerbosityLevel} from "utils/log";
import {Compiler} from "impl/compiler";
import {updateCliArgsWithTsconfig, parseToolCliArgs} from "impl/config";
import {CLI} from "utils/cli";
import {Bundler} from "impl/bundler";

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
	let compiler = new Compiler(config);
	let bundler = new Bundler(compiler);

	if(!config.watchMode){
		await compiler.runSingle();
		await bundler.produceBundle();
	} else {
		await compiler.startWatch();
		if(config.useStdio){
			// TODO: stdio interface
		}
		if(typeof(config.httpPort) === "number"){
			// TODO: http interface
		}
	}

}