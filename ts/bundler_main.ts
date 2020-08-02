import {getConfig} from "config";
import {runAllTests, runSingleTest} from "test";
import {logErrorAndExit, setLogVerbosityLevel} from "log";
import {Compiler} from "compiler";

export async function tsBundlerMain(){
	let config = getConfig();

	if(config.verbose){
		setLogVerbosityLevel(1);
	}

	if(config.test){
		await runAllTests();
		return;
	}

	if(config.testSingle){
		await runSingleTest(config.testSingle);
		return
	}

	if(!config.configPath){
		logErrorAndExit("Path to tsconfig.json is not passed. Could not start bundler.");
	}

	let compiler = new Compiler(config);
	compiler.runSingle();

}