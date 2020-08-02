import * as tsc from "typescript";
import * as path from "path";
import {BundlerConfig} from "config";
import {logErrorAndExit, logError, logWarn, logInfo} from "log";
import {BundlerTransformer} from "transformer/bundler_transformer";
import {isPathNested, stripTsExt} from "path_utils";
import {ModuleMetadataStorage} from "module_meta_storage";
import {Bundler} from "bundler";
import {writeTextFile} from "afs";
import {ModulePathResolver} from "transformer/module_path_resolver";
import {visitNodeRecursive} from "transformer/transformer_utils";

type MergedTscConfig = tsc.ParsedCommandLine & { rootNames: string[] }

/*
Полезные доки и примеры: 
https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
https://basarat.gitbook.io/typescript/overview/

Про резолв модулей и создание файлов-результатов.

https://www.typescriptlang.org/docs/handbook/module-resolution.html

Существует несколько пропертей про указание исходных файлов и контроль выхода:

files
Перечисление файлов, которые должны быть скомпилированы.
Если это свойство использовано совместно с каким-либо еще способом указания исходников - то это множество файлов будет добавлено к полученному в результате обработки других свойств.

include
Перечисление включаемых файлов, с wildcard-ами.
В нашем случае не очень полезно, т.к. мы используем files как множество начальных файлов, а не всех. Т.е. если эти файлы ссылаются на еще какие-нибудь файлы - то эти другие файлы будут включены в множество компилируемых.

exclude
Перечисление исключаемых файлов, с wildcard-ами.

compilerOptions.baseUrl
Путь, по которому резолвятся не-относительные импорты.

compilerOptions.paths
Способ потюнить алгоритм разрешения модулей по их имени, а также еще один способ указать множество входных файлов.
С помощью этого свойства можно задавать альтернативные пути, по которым будут резолвиться те же модули.
Не влияет на структуру выходной директории.

compilerOptions.outDir
Директория, в которую кладутся выходные файлы.

compilerOptions.rootDir
Свойство для контроля того, относительно какой директории будут резолвиться пути внутри compilerOptions.outDir
Грубо говоря, если все исходники лежат внутри ./ts, а rootDir указан как . - то внутри outDir будет создана директория ts, в которой будут лежать сгенерированные файлы; если rootDir будет указан как ./ts - то в outDir будут лежать прямо сгенерированные файлы из ts.
Если не указан - будет нетривиально выведен из множества исходных файлов, что может привести к багам. Поэтому мы назначаем это свойство вручную.

compilerOptions.rootDirs
Еще один способ тюнить алгоритм разрешения модулей.
Позволяет изнутри файлов внутри любой указанной директории ссылаться на файлы из любой другой указанной директории так, как если бы все указанные директории были бы одной директорией.
Например, если у нас есть ts/main.ts и lib/lib.ts, и rootDirs: ["ts", "lib"], то из main.ts можно будет импортнуть lib.ts по пути "./lib", несмотря на то, что фактически они лежат в разных директориях.
Не влияет на структуру outDir.
*/


/** содержимое блока bundlerConfig внутри tsconfig.json */
type TsconfigBundlerInclusion = {
	entryModule: string;
	entryFunction: string;
	outFile: string;
	errorHandlerName?: string;
	amdRequireName?: string;
	commonjsRequireName?: string;
	preferCommonjs?: boolean;
	noLoaderCode?: boolean;
}

// TODO: отпилить конфиг в отдельный класс
export class Compiler {

	private _watch: tsc.Watch<tsc.BuilderProgram> | null = null;
	private _program: tsc.Program | null = null;

	private readonly config: BundlerConfig;
	private readonly transformers: tsc.CustomTransformerFactory[];
	readonly metaStorage: ModuleMetadataStorage;
	private readonly modulePathResolver: ModulePathResolver;
	readonly bundler: Bundler;

	constructor(config: BundlerConfig, transformers: tsc.CustomTransformerFactory[] = []){
		this.config = config;
		this.modulePathResolver = new ModulePathResolver(this.tsconfigPath, this.mergedConfig.options);
		this.transformers = [
			context => new BundlerTransformer(context, this.metaStorage, this.modulePathResolver),
			...transformers
		];
		this.bundler = new Bundler(this);
		this.metaStorage = new ModuleMetadataStorage();
	}

	private get program(): tsc.Program {
		if(this._program){
			return this._program;
		}
		if(this._watch){
			return this._watch.getProgram().getProgram();
		}
		throw new Error("Compiler not started in any of available modes.");
	}

	startWatch(){
		let watchHost = tsc.createWatchCompilerHost(
			this.config.configPath,
			this.mergedConfig.options,
			tsc.sys,
			undefined,
			processTypescriptDiagnosticEntry
		);
		this._watch = tsc.createWatchProgram(watchHost);

		processTypescriptDiagnostics(tsc.getPreEmitDiagnostics(this.program));
	}

	/** Запуститься для разовой компиляции */
	async runSingle(){
		this._program = tsc.createProgram(this.mergedConfig);

		processTypescriptDiagnostics(tsc.getPreEmitDiagnostics(this.program));

		let emitResult = this.program.emit(undefined, undefined, undefined, undefined, {
			before: this.transformers,
			after: [
				context => ({
					transformSourceFile(fileNode: tsc.SourceFile): tsc.SourceFile {
						let prefix = fileNode.fileName;
						if(prefix.length > 30){
							prefix = "..." + prefix.substr(prefix.length - 30);
						}
						return visitNodeRecursive(fileNode, context, (node, depth) => {
							//console.log(prefix + new Array(depth + 2).join("    ") + tsc.SyntaxKind[node.kind]);
							if(node)
							return node;
						}) as tsc.SourceFile;
					},
					transformBundle(node: tsc.Bundle): tsc.Bundle {
						return node;
					}
				})
			]
		});
		processTypescriptDiagnostics(emitResult.diagnostics);

		let bundle = await this.bundler.produceBundle();
		await writeTextFile(this.inclusionConfig.outFile, bundle);
	}

	private _inclusionConfig: TsconfigBundlerInclusion | null = null;
	private _mergedConfig: MergedTscConfig | null = null;
	private loadTsconfig(){
		let [rawConfig, inclusion] = this.getTsconfigRaw();
		this.validateFixConfig(rawConfig, inclusion);
		this._mergedConfig = {
			...rawConfig,
			rootNames: [path.resolve(path.dirname(this.tsconfigPath), inclusion.entryModule)]
		}
		this._inclusionConfig = inclusion;
	}

	get mergedConfig(): MergedTscConfig {
		if(!this._mergedConfig){
			this.loadTsconfig();
		}
		return this._mergedConfig as MergedTscConfig;
	}

	get inclusionConfig(): TsconfigBundlerInclusion {
		if(!this._inclusionConfig){
			this.loadTsconfig();
		}
		return this._inclusionConfig as TsconfigBundlerInclusion;
	}

	private validateFixConfig(config: tsc.ParsedCommandLine, inclusion: TsconfigBundlerInclusion): void{
		if(config.fileNames.length < 1){
			logErrorAndExit("No file names are passed from tsconfig.json, therefore there is no root package. Nothing will be compiled.");
		}

		inclusion.outFile = path.resolve(path.dirname(this.config.configPath), inclusion.outFile);

		if(config.options.module === undefined){
			config.options.module = tsc.ModuleKind.AMD;
		} else if(config.options.module !== tsc.ModuleKind.AMD){
			logErrorAndExit("This tool is only able to work with AMD modules. Adjust compiler options in tsconfig.json.");
		}

		if(config.options.outFile){
			logErrorAndExit("This tool is not able to work with outFile passed in compilerOptions. Remove it (and/or move to bundlerConfig).");
		}

		if(config.options.incremental){
			logErrorAndExit("This tool is not able to work with incremental passed in compilerOptions.");
		}

		if(!config.options.outDir){
			logErrorAndExit("You must explicitly pass outDir within compilerOptions.");
		}

		if(!config.options.rootDir){
			config.options.rootDir = path.dirname(this.config.configPath);
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
		config.options.importHelpers = true;
		config.options.noEmitHelpers = true;

		if(!config.options.moduleResolution){
			config.options.moduleResolution = tsc.ModuleResolutionKind.NodeJs;
		} else if(config.options.moduleResolution !== tsc.ModuleResolutionKind.NodeJs){
			logErrorAndExit("Module resolution types other than node are not supported.");
		}
	}

	private getTsconfigRaw(): [tsc.ParsedCommandLine, TsconfigBundlerInclusion] {
		let parseConfigHost: tsc.ParseConfigHost = {
			useCaseSensitiveFileNames: false,
			readDirectory: tsc.sys.readDirectory,
			fileExists: tsc.sys.fileExists,
			readFile: tsc.sys.readFile,
		};

		let fileContentStr = tsc.sys.readFile(this.config.configPath);
		if(!fileContentStr){
			logErrorAndExit("Failed to read " + this.config.configPath);
		}
		let fileContentParsed = tsc.parseJsonText(this.config.configPath, fileContentStr)
		let rawJson = JSON.parse(fileContentStr);
		let projectRoot = path.dirname(this.config.configPath);
		let result = tsc.parseJsonSourceFileConfigFileContent(fileContentParsed, parseConfigHost, projectRoot);
		processTypescriptDiagnostics(result.errors)
		return [result, rawJson.bundlerConfig];
	}

	get outDir(): string { return this.mergedConfig.options.outDir as string }
	get entryModule(): string { 
		let absPath = path.resolve(path.dirname(this.tsconfigPath), this.inclusionConfig.entryModule);
		let name = stripTsExt(this.modulePathResolver.getAbsoluteModulePath(absPath));
		return name;
	}
	get entryFunction(): string { return this.inclusionConfig.entryFunction }
	get errorHandlerName(): string | null { return this.inclusionConfig.errorHandlerName || null }
	get amdRequireName(): string { return this.inclusionConfig.amdRequireName || "require" }
	get commonjsRequireName(): string { return this.inclusionConfig.commonjsRequireName || "require" }
	get preferCommonjs(): boolean { return this.inclusionConfig.preferCommonjs === false? false: true }
	get noLoaderCode(): boolean { return !!this.inclusionConfig.noLoaderCode }
	get tsconfigPath(): string { return this.config.configPath; }

}

export function processTypescriptDiagnosticEntry(d: tsc.Diagnostic): boolean {
	let msg: (string | null)[] = [];

	if(d.file) {
		let origin = d.file.fileName;

		if(typeof(d.start) === "number"){
			let { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
			origin += ` (${line + 1}:${character + 1}`;
		}

		msg.push(origin);
	}
	
	msg.push(tsc.DiagnosticCategory[d.category] + ":")
	msg.push(tsc.flattenDiagnosticMessageText(d.messageText, '\n'));
	msg.push(d.code.toString());

	let msgString = msg.map(_ => _ && _.trim()).filter(_ => !!_).join(" ");
	if(d.category == tsc.DiagnosticCategory.Error){
		logError(msgString)
		return true;
	} else if(d.category === tsc.DiagnosticCategory.Warning) {
		logWarn(msgString);
	} else {
		logInfo(msgString);
	}

	return false;
}

export function processTypescriptDiagnostics(diagnostics?: Iterable<tsc.Diagnostic> | null){
	let haveErrors = false;
    for(let d of diagnostics || []) {
		haveErrors = haveErrors || processTypescriptDiagnosticEntry(d);
	}
	
	if(haveErrors){
		process.exit(1)
	}
}