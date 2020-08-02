import {CLI} from "cli";
import * as path from "path";

export interface BundlerConfig {
	configPath: string;
	fancy?: boolean;
	devmode?: boolean;
	verbose?: boolean;
	help?: boolean;
	useStdio?: boolean;
	httpPort?: number;
	test?: boolean;
	testSingle?: string;
}

function parseCliArgs(): BundlerConfig {
	let res = new CLI({
		helpHeader: "A helper tool to assemble Javascript bundles out of Typescript projects.",
		definition: {
			configPath: CLI.str({ keys: "--config", definition: "Path to tsconfig.json.", default: ""}),
			fancy: CLI.bool({ keys: "--fancy", definition: "Output beatiful debuggable code (instead of compressed mess that complies to older ECMA version)." }),
			devmode: CLI.bool({ keys: "--devmode", definition: "Enables compilation-after-any-source-change. Also sets --fancy to true." }),
			useStdio: CLI.bool({ keys: "--use-stdio", definition: "Enables communication with outside world through STDIO. Only usable in devmode." }),
			httpPort: CLI.int({ keys: "--port", definition: "Enables tool to listen on specified port. Any HTTP request to this port will trigger bundling, and response to this request will be bundled code. Devmode only.", default: 0 }),
			verbose: CLI.bool({ keys: ["-v", "--verbose"], definition: "Adds some more bundler-debug-related trash in stderr." }),
			help: CLI.help({ keys: ["-h", "--h", "-help", "--help"], definition: "Shows list of commands." }),
			test: CLI.bool({ keys: ["--test"], definition: "Run autotests." }),
			testSingle: CLI.str({ keys: ["--test-single"], definition: "Run one single autotest.", default: "" })
		}
	}).parseArgs();

	if(res.configPath){
		res.configPath = path.resolve(res.configPath);
	}

	return res;
}


let config: BundlerConfig | null = null;
export function getConfig(): BundlerConfig {
	if(!config){
		config = parseCliArgs();
	}
	return config;
}