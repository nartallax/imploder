import {runAllTests, runSingleTest} from "test";
import {logErrorAndExit, setLogVerbosityLevel} from "log";
import {Compiler} from "compiler";
import {updateCliArgsWithTsconfig, parseToolCliArgs} from "config";
import {CLI} from "cli";

export async function tsBundlerMain(){
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
	compiler.runSingle();

}