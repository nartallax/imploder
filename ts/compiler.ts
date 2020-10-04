import * as tsc from "typescript";
import {TSToolConfig} from "config";
import * as path from "path";
import {BeforeJsBundlerTransformer} from "transformer/before_js_transformer";
import {ModuleMetadataStorage} from "module_meta_storage";
import {Bundler} from "bundler";
import {writeTextFile} from "afs";
import {ModulePathResolver} from "module_path_resolver";
import {AfterJsBundlerTransformer} from "transformer/after_js_transformer";
import {processTypescriptDiagnosticEntry, processTypescriptDiagnostics} from "tsc_diagnostics";

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

type MergedTscConfig = tsc.ParsedCommandLine & { rootNames: string[] }

export class Compiler {

	readonly config: TSToolConfig;
	private readonly tscMergedConfig: MergedTscConfig;
	private readonly transformers: tsc.CustomTransformerFactory[];
	readonly metaStorage: ModuleMetadataStorage;
	readonly bundler: Bundler;

	constructor(config: TSToolConfig, transformers: tsc.CustomTransformerFactory[] = []){
		this.config = config;
		this.tscMergedConfig = {
			...config.tscParsedCommandLine,
			rootNames: [path.resolve(path.dirname(config.tsconfigPath), config.entryModule)]
		}
		this.transformers = transformers;
		this.bundler = new Bundler(this);
		this.metaStorage = new ModuleMetadataStorage();
	}

	private _watch: tsc.Watch<tsc.BuilderProgram> | null = null;
	private _program: tsc.Program | null = null;
	get program(): tsc.Program {
		if(this._program){
			return this._program;
		}
		if(this._watch){
			return this._watch.getProgram().getProgram();
		}
		throw new Error("Compiler not started in any of available modes.");
	}

	private _host: tsc.CompilerHost | null = null;
	get compilerHost(): tsc.CompilerHost {
		if(!this._host){
			throw new Error("Compiler not started, no compiler host available.");
		}
		return this._host;
	}

	private _modulePathResolver: ModulePathResolver | null = null;
	get modulePathResolver(){
		if(this._modulePathResolver === null){
			this._modulePathResolver = new ModulePathResolver(this.config.tsconfigPath, this.tscMergedConfig.options, this);
		}
		return this._modulePathResolver;
	}

	startWatch(){
		let watchHost = tsc.createWatchCompilerHost(
			this.config.tsconfigPath,
			this.tscMergedConfig.options,
			tsc.sys,
			undefined,
			processTypescriptDiagnosticEntry
		);
		this._watch = tsc.createWatchProgram(watchHost);
		this._host = tsc.createCompilerHost(this._watch.getProgram().getCompilerOptions())

		processTypescriptDiagnostics(tsc.getPreEmitDiagnostics(this.program));
	}

	/** Запуститься для разовой компиляции */
	async runSingle(){
		this._host = tsc.createCompilerHost(this.tscMergedConfig.options);
		this._program = tsc.createProgram({
			...this.tscMergedConfig,
			host: this._host
		});
		
		processTypescriptDiagnostics(tsc.getPreEmitDiagnostics(this.program));

		let emitResult = this.program.emit(undefined, undefined, undefined, undefined, {
			before: [
				context => new BeforeJsBundlerTransformer(context, this.metaStorage, this.modulePathResolver),
				...this.transformers
			],
			after: [
				context => new AfterJsBundlerTransformer(context, this.metaStorage, this.modulePathResolver)
			]
			/*
			after: [
				context => ({
					transformSourceFile(fileNode: tsc.SourceFile): tsc.SourceFile {
						let prefix = fileNode.fileName;
						if(prefix.length > 30){
							prefix = "..." + prefix.substr(prefix.length - 30);
						}
						return visitNodeRecursive(fileNode, context, (node, depth) => {
							console.log(prefix + new Array(depth + 2).join("    ") + tsc.SyntaxKind[node.kind]);
							return node;
						}) as tsc.SourceFile;
					},
					transformBundle(node: tsc.Bundle): tsc.Bundle {
						return node;
					}
				})
			]
			*/
		});
		processTypescriptDiagnostics(emitResult.diagnostics);

		let bundle = await this.bundler.produceBundle();
		await writeTextFile(this.config.outFile, bundle);
	}

}