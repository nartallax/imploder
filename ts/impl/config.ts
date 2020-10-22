import {CLI} from "utils/cli";
import * as path from "path";
import * as tsc from "typescript";
import {logErrorAndExit, logError} from "utils/log";
import {processTypescriptDiagnostics} from "utils/tsc_diagnostics";
import {isPathNested} from "utils/path_utils";

/** Опции, которые можно передать тулу через командную строку */
export interface TSToolCLIArgs {
	tsconfigPath: string;
	verbose?: boolean;
	help?: boolean;
	useStdio?: boolean;
	httpPort?: number;
	test?: boolean;
	testSingle?: string;
	profile?: string;
}

/** Содержимое блока tstoolConfig внутри tsconfig.json
 * обязательные поля - только entryModule, entryFunction, outFile. target рекомендуется выставить
*/
export interface TsconfigTSToolInclusion extends TSToolProfile {
	profiles?: { [profileName: string]: TSToolProfile }
}

/** Описание профиля тула в tsconfig.json */
export interface TSToolProfile {
	entryModule: string;
	entryFunction: string;
	outFile: string;
	errorHandlerName?: string;
	amdRequireName: string;
	commonjsRequireName: string;
	preferCommonjs: boolean;
	noLoaderCode: boolean;
	minify: boolean;
	watchMode: boolean;
	target: keyof typeof tsc.ScriptTarget;
	embedTslib?: boolean;
	preserveOutDir?: boolean;
}

/** Конфиг всего тула в целом */
export interface TSToolConfig extends TSToolCLIArgs, TSToolProfile { 
	tscParsedCommandLine: tsc.ParsedCommandLine;
};

export function parseToolCliArgs(args: readonly string[]): TSToolCLIArgs {
	let res = new CLI({
		helpHeader: "A helper tool to assemble Javascript bundles out of Typescript projects.",
		definition: {
			tsconfigPath: CLI.str({ keys: "--tsconfig", definition: "Path to tsconfig.json.", default: ""}),
			profile: CLI.str({ keys: "--profile", definition: "Name of tool profile to use. Profiles are defined in tsconfig.json.", default: ""}),
			useStdio: CLI.bool({ keys: "--use-stdio", definition: "Enables communication with outside world through STDIO. Only usable in watchmode." }),
			httpPort: CLI.int({ keys: "--port", definition: "Enables tool to listen on specified port. Any HTTP request to this port will trigger bundling, and response to this request will be bundled code. Watchmode only.", default: 0 }),
			verbose: CLI.bool({ keys: ["-v", "--verbose"], definition: "Adds some more bundler-debug-related trash in stderr." }),
			help: CLI.help({ keys: ["-h", "--h", "-help", "--help"], definition: "Shows list of commands." }),
			test: CLI.bool({ keys: ["--test"], definition: "Run autotests." }),
			testSingle: CLI.str({ keys: ["--test-single"], definition: "Run one single autotest.", default: "" })
		}
	}).parseArgs(args);

	if(res.tsconfigPath){
		res.tsconfigPath = path.resolve(res.tsconfigPath);
	}

	return res;
}

export function updateCliArgsWithTsconfig(cliArgs: TSToolCLIArgs): TSToolConfig {
	let [tscParsedCommandLine, inclusionConfig] = getTsconfigRaw(cliArgs.tsconfigPath);
	
	let profile: TSToolProfile = inclusionConfig;
	if(cliArgs.profile){
		if(!inclusionConfig.profiles || !(cliArgs.profile in inclusionConfig.profiles)){
			logErrorAndExit(`Profile name is passed in command-line arguments ("${cliArgs.profile}"), but there is no such profile defined.`);
		}
		profile = {
			...profile,
			...inclusionConfig.profiles[cliArgs.profile]
		};
	}
	fixProfile(profile, cliArgs.tsconfigPath);

	validateFixConfig(cliArgs.tsconfigPath, tscParsedCommandLine, profile);

	let config: TSToolConfig = {
		...cliArgs,
		...profile,
		tscParsedCommandLine: tscParsedCommandLine
	}
	return config;
}

export function getFullConfigFromCliArgs(args: readonly string[]): TSToolConfig {
	let cliArgs = parseToolCliArgs(args);
	return updateCliArgsWithTsconfig(cliArgs);
}

function getTsconfigRaw(tsconfigPath: string): [tsc.ParsedCommandLine, TsconfigTSToolInclusion] {
	let parseConfigHost: tsc.ParseConfigHost = {
		useCaseSensitiveFileNames: false,
		readDirectory: tsc.sys.readDirectory,
		fileExists: tsc.sys.fileExists,
		readFile: tsc.sys.readFile,
	};

	let fileContentStr = tsc.sys.readFile(tsconfigPath);
	if(!fileContentStr){
		logErrorAndExit(`Failed to read tsconfig path "${tsconfigPath}"`);
	}
	let fileContentParsed = tsc.parseJsonText(tsconfigPath, fileContentStr)
	let rawJson = JSON.parse(fileContentStr);
	let projectRoot = path.dirname(tsconfigPath);
	let result = tsc.parseJsonSourceFileConfigFileContent(fileContentParsed, parseConfigHost, projectRoot);
	processTypescriptDiagnostics(result.errors)
	return [result, rawJson.tstoolConfig];
}

function validateFixConfig(tsconfigPath: string, config: tsc.ParsedCommandLine, profile: TSToolProfile): void{
	if(config.fileNames.length < 1){
		logErrorAndExit("No file names are passed from tsconfig.json, therefore there is no root package. Nothing will be compiled.");
	}

	let rawOptions: any;
	if(config.raw){
		rawOptions = config.raw.compilerOptions;
	} else {
		throw new Error("No raw options supplied.");
	}

	if(config.options.module === undefined){
		config.options.module = tsc.ModuleKind.AMD;
		rawOptions.module = "amd";
	} else if(config.options.module !== tsc.ModuleKind.AMD){
		logErrorAndExit("This tool is only able to work with AMD modules. Adjust compiler options in tsconfig.json.");
	}

	if(config.options.outFile){
		logErrorAndExit("This tool is not able to work with outFile passed in compilerOptions. Remove it (and/or move to tstoolConfig).");
	}

	if(config.options.incremental){
		logErrorAndExit("This tool is not able to work with incremental passed in compilerOptions.");
	}

	if(!config.options.outDir){
		logErrorAndExit("You must explicitly pass outDir within compilerOptions.");
	}

	if(!config.options.rootDir){
		rawOptions.rootDir = config.options.rootDir = path.dirname(tsconfigPath);
	}

	if(config.options.rootDirs){
		let dirs = config.options.rootDirs;
		let haveNestedDirs = false;
		for(let i = 0; i < dirs.length; i++){
			for(let j = i + 1; j < dirs.length; j++){
				if(isPathNested(dirs[i], dirs[j])){
					logError("Values of rootDirs must not be nested within one another, but there are \"" + dirs[i] + "\" and \"" + dirs[j] + "\" which are nested.");
					haveNestedDirs = true;
				}
			}
		}
		if(haveNestedDirs){
			process.exit(1);
		}
	}

	// опции про tslib: все вспомогательные функции импортировать из tslib, не прописывать в компилированном коде по новой
	rawOptions.importHelpers = config.options.importHelpers = true;
	rawOptions.noEmitHelpers = config.options.noEmitHelpers = true;

	config.options.target = tsc.ScriptTarget[profile.target];
	rawOptions.target = profile.target;

	if(!config.options.moduleResolution){
		config.options.moduleResolution = tsc.ModuleResolutionKind.NodeJs;
		rawOptions.moduleResolution = "node";
	} else if(config.options.moduleResolution !== tsc.ModuleResolutionKind.NodeJs){
		logErrorAndExit("Module resolution types other than node are not supported.");
	}

}

function fixProfile(profile: TSToolProfile, tsconfigPath: string){
	profile.outFile = path.resolve(path.dirname(tsconfigPath), profile.outFile);
	profile.preferCommonjs = profile.preferCommonjs === false? false: true;
	profile.amdRequireName = profile.amdRequireName || "require";
	profile.commonjsRequireName = profile.commonjsRequireName || "require";
	profile.noLoaderCode = !!profile.noLoaderCode;
	profile.minify = !!profile.minify;
	profile.watchMode = !!profile.watchMode;
	profile.target = profile.target || "ES5"
}