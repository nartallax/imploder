import {runAllTests, runSingleTest} from "test";
import {logErrorAndExit, setLogVerbosityLevel} from "log";
import {Compiler} from "compiler";
import {updateCliArgsWithTsconfig, parseToolCliArgs} from "config";
import {CLI} from "cli";
import {Bundler} from "bundler";
import {writeTextFile} from "afs";

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

	if(!config.watchMode){
		await compiler.runSingle();
		let bundler = new Bundler(compiler);
		let bundle = await bundler.produceBundle();
		await writeTextFile(config.outFile, bundle);
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