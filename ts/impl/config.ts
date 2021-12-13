import {CLI} from "utils/cli";
import * as path from "path";
import * as tsc from "typescript";
import {processTypescriptDiagnostics} from "utils/tsc_diagnostics";
import {isPathNested} from "utils/path_utils";
import {Imploder} from "imploder";
import {LoggerImpl} from "impl/logger";

export function parseToolCliArgs(args: readonly string[]): Imploder.CLIArgs {
	let res = new CLI({
		helpHeader: "A helper tool to assemble Javascript bundles out of Typescript projects.",
		definition: {
			tsconfigPath: CLI.str({ keys: "--tsconfig", definition: "Path to tsconfig.json.", default: ""}),
			profile: CLI.str({ keys: "--profile", definition: "Name of tool profile to use. Profiles are defined in tsconfig.json.", default: ""}),
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

function parseTsconfigToProfile(tsconfigPath: string, profileName?: string): [tsc.ParsedCommandLine, Imploder.Profile] {
	let [tscParsedCommandLine, inclusionConfig] = getTsconfigRaw(tsconfigPath);
	
	let profile: Imploder.Profile = inclusionConfig;
	profile.plugins = [
		...(tscParsedCommandLine.raw.compilerOptions?.plugins || []),
		...(profile.plugins || [])
	];

	if(profileName){
		if(!inclusionConfig.profiles || !(profileName in inclusionConfig.profiles)){
			LoggerImpl.writeDefaultAndExit(`Profile name is passed in command-line arguments ("${profileName}"), but there is no such profile defined.`);
		}
		let targetProfile = inclusionConfig.profiles[profileName];
		profile = {
			...profile,
			...targetProfile,
			plugins: [
				...(profile.plugins || []),
				...(targetProfile.plugins || [])
			]
		};
	}

	return [tscParsedCommandLine, profile]
}

export function updatePartialConfigWithTsconfig(tsconfigPath: string, partConfig?: Partial<Imploder.Config>): Imploder.Config {
	tsconfigPath = path.resolve(tsconfigPath);
	let [tscParsedCommandLine, profile] = parseTsconfigToProfile(tsconfigPath, (partConfig || {}).profile);
	profile = {
		...profile,
		...(partConfig || {})
	};

	fixProfile(profile, tsconfigPath);
	validateFixConfig(tsconfigPath, tscParsedCommandLine, profile);

	return {
		...profile,
		tsconfigPath,
		tscParsedCommandLine
	}


}

export function updateCliArgsWithTsconfig(cliArgs: Imploder.CLIArgs): Imploder.Config {
	let [tscParsedCommandLine, profile] = parseTsconfigToProfile(cliArgs.tsconfigPath, cliArgs.profile);
	fixProfile(profile, cliArgs.tsconfigPath);
	validateFixConfig(cliArgs.tsconfigPath, tscParsedCommandLine, profile);

	let config: Imploder.Config = {
		...cliArgs,
		...profile,
		tscParsedCommandLine: tscParsedCommandLine
	}
	return config;
}

export function getFullConfigFromCliArgs(args: readonly string[]): Imploder.Config {
	let cliArgs = parseToolCliArgs(args);
	return updateCliArgsWithTsconfig(cliArgs);
}

function getTsconfigRaw(tsconfigPath: string): [tsc.ParsedCommandLine, Imploder.TsconfigInclusion] {
	let parseConfigHost: tsc.ParseConfigHost = {
		useCaseSensitiveFileNames: false,
		readDirectory: tsc.sys.readDirectory,
		fileExists: tsc.sys.fileExists,
		readFile: tsc.sys.readFile,
	};

	let fileContentStr = tsc.sys.readFile(tsconfigPath);
	if(!fileContentStr){
		LoggerImpl.writeDefaultAndExit(`Failed to read tsconfig path "${tsconfigPath}"`);
	}
	let fileContentParsed = tsc.parseJsonText(tsconfigPath, fileContentStr)

	let projectRoot = path.dirname(tsconfigPath);
	let result = tsc.parseJsonSourceFileConfigFileContent(fileContentParsed, parseConfigHost, projectRoot);
	let haveErrors = processTypescriptDiagnostics(result.errors, undefined, projectRoot);
	if(haveErrors){
		throw new Error("Tsconfig has errors.");
	}

	return [result, result.raw.imploderConfig];
}

function validateFixConfig(tsconfigPath: string, config: tsc.ParsedCommandLine, profile: Imploder.Profile): void{
	if(config.fileNames.length < 1){
		LoggerImpl.writeDefaultAndExit("No file names are passed from tsconfig.json, therefore there is no root package. Nothing will be compiled.");
	}

	if(!(profile.target in tsc.ScriptTarget)){
		for(let targetName in tsc.ScriptTarget){
			if(targetName.toLowerCase() === profile.target.toLowerCase()){
				profile.target = targetName as keyof typeof tsc.ScriptTarget;
				break;
			}
		}

		if(!(profile.target in tsc.ScriptTarget)){
			throw new Error("This target is not known to Typescript: \"" + profile.target + "\"");
		}
	}

	// зачем здесь модифицировать еще и исходный json?
	// я не помню. возможно, это когда-то помогало мне отлаживать.
	// в целом его как-то использовать не надо никогда
	// например, потому, что в нем могут быть extend-ы (а они не резолвятся сами собой)
	// т.е. config.raw всегда будет содержать ровно то, что содержит tsconfig.json
	// хотя фактически в конфиге есть больше опций
	let rawOptions: Record<string, unknown>;
	if(config.raw){
		rawOptions = config.raw.compilerOptions;
	} else {
		throw new Error("No raw options supplied.");
	}

	if(config.options.module === undefined){
		config.options.module = tsc.ModuleKind.AMD;
		rawOptions.module = "amd";
	} else if(config.options.module !== tsc.ModuleKind.AMD){
		LoggerImpl.writeDefaultAndExit("This tool is only able to work with AMD modules. Adjust compiler options in tsconfig.json.");
	}

	if(config.options.outFile){
		LoggerImpl.writeDefaultAndExit("This tool is not able to work with outFile passed in compilerOptions. Remove it (and/or move to imploderConfig).");
	}

	if(config.options.incremental){
		LoggerImpl.writeDefaultAndExit("This tool is not able to work with incremental passed in compilerOptions.");
	}

	if(!config.options.outDir){
		LoggerImpl.writeDefaultAndExit("You must explicitly pass outDir within compilerOptions.");
	}
	// тут я мог бы резолвить outDir, но не буду
	// tsc сам его резолвит при чтении конфига, т.е. он уже абсолютный

	if(!config.options.rootDir){
		rawOptions.rootDir = config.options.rootDir = path.dirname(tsconfigPath);
	}

	if(config.options.rootDirs){
		let dirs = config.options.rootDirs;
		let haveNestedDirs = false;
		for(let i = 0; i < dirs.length; i++){
			for(let j = i + 1; j < dirs.length; j++){
				if(isPathNested(dirs[i], dirs[j])){
					LoggerImpl.writeDefault("Values of rootDirs must not be nested within one another, but there are \"" + dirs[i] + "\" and \"" + dirs[j] + "\" which are nested.");
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
		LoggerImpl.writeDefaultAndExit("Module resolution types other than \"node\" are not supported.");
	}

}

function fixProfile(profile: Imploder.Profile, tsconfigPath: string){
	if(!profile.entryModule){
		LoggerImpl.writeDefaultAndExit(`Option "entryModule" is required, but absent.`);
	}
	if(!profile.outFile){
		LoggerImpl.writeDefaultAndExit(`Option "outFile" is required, but absent.`);
	}
	profile.outFile = path.resolve(path.dirname(tsconfigPath), profile.outFile);
	profile.noLoaderCode = !!profile.noLoaderCode;
	profile.minify = !!profile.minify;
	profile.watchMode = !!profile.watchMode;
	profile.target = profile.target || "ES5"
	if(tsc.ScriptTarget[profile.target] < tsc.ScriptTarget.ES5){
		LoggerImpl.writeDefault("Selected script target is " + profile.target + ", but it's not really supported as it is too old. Proceed at your own risk.");
	}
	profile.embedTslib = profile.embedTslib === false? false: true;
}