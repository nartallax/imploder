import {logInfo, logErrorAndExit, logError} from "utils/log";
import {SingleBuildTestProject} from "./single_build_test_project";
import {ArbitraryTests} from "./arbitrary_tests";

interface Tester {
	couldRunTest(name: string): boolean;
	runTest(name: string): boolean | Promise<boolean>;
}

const allKnownTestNames: ReadonlyArray<string> = [
	...SingleBuildTestProject.availableProjects,
	...Object.keys(ArbitraryTests)
]

const allKnownTesters: ReadonlyArray<Tester> = [
	SingleBuildTestProject,
	{couldRunTest: name => name in ArbitraryTests, runTest: name => ArbitraryTests[name]()}
]

export async function runAllTests(){
	logInfo("Running all tests.");

	let failCount = 0;
	for(let testName of allKnownTestNames){
		let result = await runTest(testName);
		if(!result)
			failCount++;
	}

	if(failCount < 1){
		logInfo("Done. Testing successful.");
		await new Promise(ok => setTimeout(ok, 1000))
		process.exit(0);
	} else {
		logInfo("Done. Testing failed (" + failCount + " / " + allKnownTestNames.length + " tests failed)");
		await new Promise(ok => setTimeout(ok, 1000))
		process.exit(1);
	}
	
}

export async function runSingleTest(name: string){
	if(allKnownTestNames.indexOf(name) < 0){
		logErrorAndExit("Test name \"" + name + "\" is not known.");
	}

	let ok = await runTest(name);
	if(!ok){
		logInfo("Done. Test failed.")
		await new Promise(ok => setTimeout(ok, 1000))
		process.exit(1);
	} else {
		logInfo("Done. Testing successful.")
		await new Promise(ok => setTimeout(ok, 1000))
		process.exit(0);
	}
}

async function runTest(name: string): Promise<boolean> {
	for(let tester of allKnownTesters){
		if(tester.couldRunTest(name)){
			logInfo("Running test: " + name);
			try {
				return await Promise.resolve(tester.runTest(name));
			} catch(e){
				logError(`Test "${name}" unexpectedly throws error: ${e.message}`);
				return false;
			}
		}
	}
	logErrorAndExit("Test with name \"" + name + "\" is not known to any available tester.");
}