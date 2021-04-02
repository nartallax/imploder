import {SingleBuildTestProject} from "./single_build_test_project";
import {ArbitraryTests} from "./arbitrary_tests";
import {Imploder} from "imploder";
import {LoggerImpl} from "impl/logger";

interface Tester {
	couldRunTest(name: string): boolean;
	runTest(name: string, cliArgsBase: Imploder.CLIArgs): boolean | Promise<boolean>;
}

const allKnownTestNames: ReadonlyArray<string> = [
	...SingleBuildTestProject.availableProjects,
	...Object.keys(ArbitraryTests)
]

const allKnownTesters: ReadonlyArray<Tester> = [
	SingleBuildTestProject,
	{couldRunTest: name => name in ArbitraryTests, runTest: (name, cliArgsBase) => ArbitraryTests[name](cliArgsBase)}
]

export async function runAllTests(cliArgsBase: Imploder.CLIArgs){
	LoggerImpl.writeDefault("Running all tests.");

	let failCount = 0;
	for(let testName of allKnownTestNames){
		let result = await runTest(testName, cliArgsBase);
		if(!result)
			failCount++;
	}

	if(failCount < 1){
		LoggerImpl.writeDefault("Done. Testing successful.");
		await new Promise(ok => setTimeout(ok, 1000))
		process.exit(0);
	} else {
		LoggerImpl.writeDefault("Done. Testing failed (" + failCount + " / " + allKnownTestNames.length + " tests failed)");
		await new Promise(ok => setTimeout(ok, 1000))
		process.exit(1);
	}
	
}

export async function runSingleTest(name: string, cliArgsBase: Imploder.CLIArgs){
	let ok = await runTest(name, cliArgsBase);
	if(!ok){
		LoggerImpl.writeDefault("Done. Test failed.")
		await new Promise(ok => setTimeout(ok, 1000))
		process.exit(1);
	} else {
		LoggerImpl.writeDefault("Done. Testing successful.")
		await new Promise(ok => setTimeout(ok, 1000))
		process.exit(0);
	}
}

async function runTest(name: string, cliArgsBase: Imploder.CLIArgs): Promise<boolean> {
	for(let tester of allKnownTesters){
		if(tester.couldRunTest(name)){
			LoggerImpl.writeDefault("Running test: " + name);
			try {
				return await Promise.resolve(tester.runTest(name, cliArgsBase));
			} catch(e){
				LoggerImpl.writeDefault(`Test "${name}" unexpectedly throws error: ${e.stack}`);
				return false;
			}
		}
	}
	LoggerImpl.writeDefaultAndExit("Test with name \"" + name + "\" is not known to any available tester.");
}