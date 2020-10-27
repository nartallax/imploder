import {CLI} from "utils/cli";
import * as path from "path";
import * as tsc from "typescript";
import {logErrorAndExit, logError, logWarn} from "utils/log";
import {processTypescriptDiagnostics} from "utils/tsc_diagnostics";
import {isPathNested} from "utils/path_utils";

/** Описание профиля тула в tsconfig.json */
export interface TSToolProfile {
	// обязательные основные параметры
	/** Путь к модулю-точке входа относительно корня проекта */
	entryModule: string;
	/** Имя функции, экспортируемой из модуля-точки входа, которая будет вызвана на старте бандла */
	entryFunction: string;
	/** Путь к файлу, в который будет помещен бандл после сборки */
	outFile: string;

	// прочие параметры
	/** Версия ECMAScript, которой будет соответствовать полученный бандл. 
	 * Значение по умолчанию - ES5. Версии ниже ES5 не поддерживаются */
	target: keyof typeof tsc.ScriptTarget;
	/** Имя функции-обработчика ошибок запуска. Должна быть доступна в том месте, где запускается бандл */
	errorHandlerName?: string;
	/** Имя функции require для AMD, умолчание = "require" */
	amdRequireName: string;
	/** Имя функции require для CommonJS, умолчание = "require" */
	commonjsRequireName: string;
	/** Использовать CommonJS для подгрузки исходных внешних зависимостей, или AMD?
	 * По умолчанию true.
	 * Следует выставлять в true при сборке бандла, который будет запускаться в NodeJS, например
	 * Не влияет на подгрузку модулей, включенных в бандл. Не влияет на асинхронную подгрузку модулей. */
	loadInitialExternalsWithCommonJS: boolean;
	/** Минифицировать ли код */
	minify: boolean;
	/** Включить ли tslib в бандл, если он требуется каким-либо модулем
	 * По умолчанию true.*/
	embedTslib?: boolean;
	/** Не удалять директорию с выходными js-файлами.
	 * По умолчанию, при запуске тул удаляет эту директорию ради консистентности билдов. */
	preserveOutDir?: boolean;

	/** Список путей к проектам с трансформаторами.
	 * Пути могут быть относительными, от корня проекта, в котором указаны. */
	transformerProjects?: string[];

	// watchmode
	/** Запуститься в watch-моде. Отслеживать изменения в файлах и перекомпилировать сразу же. */
	watchMode: boolean;
	/** Будет ли тул ожидать каких-либо команд в stdin, и будет ли выдавать какие-либо структурированные ответы в stdout
	 * Удобно при встраивании куда-либо. Работает только в watch-моде */
	useStdio?: boolean;
	/** Если указан этот порт - то тул запустит локальный http-сервер, который будет ожидать команд, на указанном порту.
	 * Удобно при разработке. Работает только в watch-моде. */
	httpPort?: number;

	// отладочные опции
	/** Выдавать ли больше логов в stderr */
	verbose?: boolean;
	/** Не выдавать логи про ошибки и прочие диагностические сообщения процесса компиляции */
	noBuildDiagnosticMessages?: boolean;
	/** Не включать код загрузчика в бандл, и сопутствующие ему обертки.
	 * Если включено, бандл будет состоять только из кода модулей. */
	noLoaderCode: boolean;
}

/** Конфиг всего тула в целом */
export interface TSToolConfig extends TSToolCLIArgs, TSToolProfile { 
	tscParsedCommandLine: tsc.ParsedCommandLine;
};

/** Опции, которые можно передать тулу через командную строку */
export interface TSToolCLIArgs {
	tsconfigPath: string;
	verbose?: boolean;
	help?: boolean;
	test?: boolean;
	testSingle?: string;
	profile?: string;
}

/** Содержимое блока tstoolConfig внутри tsconfig.json */
export interface TsconfigTSToolInclusion extends TSToolProfile {
	profiles?: { [profileName: string]: TSToolProfile }
}

export function parseToolCliArgs(args: readonly string[]): TSToolCLIArgs {
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
	if(!profile.entryModule){
		logErrorAndExit(`Option "entryModule" is required, but absent.`);
	}
	if(!profile.entryFunction){
		logErrorAndExit(`Option "entryFunction" is required, but absent.`);
	}
	if(!profile.outFile){
		logErrorAndExit(`Option "outFile" is required, but absent.`);
	}
	profile.outFile = path.resolve(path.dirname(tsconfigPath), profile.outFile);
	profile.loadInitialExternalsWithCommonJS = profile.loadInitialExternalsWithCommonJS === false? false: true;
	profile.amdRequireName = profile.amdRequireName || "require";
	profile.commonjsRequireName = profile.commonjsRequireName || "require";
	profile.noLoaderCode = !!profile.noLoaderCode;
	profile.minify = !!profile.minify;
	profile.watchMode = !!profile.watchMode;
	profile.target = profile.target || "ES5"
	if(tsc.ScriptTarget[profile.target] < tsc.ScriptTarget.ES5){
		logWarn("Selected script target is " + profile.target + ", but it's not really supported as it is too old. Proceed at your own risk.");
	}
	profile.embedTslib = profile.embedTslib === false? false: true;
}