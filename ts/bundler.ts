import * as tsc from "typescript";
import {Compiler} from "compiler";
import {ModuleOrderer} from "module_orderer";
import {loaderCode} from "generated/loader_code";
import {logDebug} from "log";
import * as path from "path";
import {readTextFile} from "afs";
import {ModuleMetaShort, ModuleDefinitonArray} from "loader/loader_types";
import {stripTsExt} from "path_utils";
import {minifyJsCode} from "minification";

/** сборщик бандл-файла из кучи исходников */
export class Bundler {

	private readonly compiler: Compiler;

	constructor(compiler: Compiler){
		this.compiler = compiler;
	}

	async produceBundle(): Promise<string>{
		let result = [] as string[];
		if(!this.compiler.config.noLoaderCode){
			result.push(await this.getPrefixCode());
		}

		await this.loadAbsentModuleCode();

		let moduleOrder = new ModuleOrderer(this.compiler.metaStorage).getModuleOrder(this.getEntryModuleName());
		logDebug("Bundle related modules: " + JSON.stringify(moduleOrder))

		let defArrArr = this.buildModuleDefinitionArrayArray(moduleOrder.modules, moduleOrder.circularDependentModules);
		result.push(JSON.stringify(defArrArr));
		
		if(!this.compiler.config.noLoaderCode){
			result.push(this.getPostfixCode());
		}

		return result.join("\n");
	}

	private getEntryModuleName(): string {
		let absPath = path.resolve(path.dirname(this.compiler.config.tsconfigPath), this.compiler.config.entryModule);
		let name = stripTsExt(this.compiler.modulePathResolver.getAbsoluteModulePath(absPath));
		return name;
	}

	private buildModuleDefinitionArrayArray(modules: string[], circularDependentModules: Set<string>): ModuleDefinitonArray[] {
		return modules.map(name => {
			let meta = this.compiler.metaStorage.get(name);
			let code = meta.jsCode;
			if(!code){
				throw new Error("Code for module " + name + " is not loaded at bundling time.");
			}

			let isInCircularDependency = circularDependentModules.has(name);
			let haveModuleRefs = meta.exportModuleReferences.length > 0 && isInCircularDependency;
			let needExports = meta.exports.length > 0 && isInCircularDependency
			if(needExports || !!meta.altName || meta.hasOmniousExport || haveModuleRefs){

				let short: ModuleMetaShort = {}
				if(haveModuleRefs){
					short.exportRefs = meta.exportModuleReferences;
				}
				if(needExports){
					short.exports = meta.exports;
				}
				if(meta.hasOmniousExport){
					short.arbitraryType = true;
				}
				if(meta.altName){
					short.altName = meta.altName;
				}

				return [name, meta.dependencies, short, code]
			} else {
				return meta.dependencies.length > 0? [name, meta.dependencies, code]: [name, code]
			}
		});
	}

	private minifiedLoaderCode: string | null = null;
	async getPrefixCode(): Promise<string> {
		let resultLoaderCode = loaderCode;
		if(this.compiler.config.minify){
			if(this.minifiedLoaderCode === null){
				this.minifiedLoaderCode = await this.minify(resultLoaderCode, "<loader>", tsc.ScriptTarget.ES5);
			}
			resultLoaderCode = this.minifiedLoaderCode;
		}
		resultLoaderCode = resultLoaderCode.replace(/;?[\n\s]*$/, "");
		return "(" + resultLoaderCode + ")(\n";
	}

	/* получить код, который должен стоять в бандле после перечисления определения модулей
	thenCode - код, который будет передан в качестве аргумента в launch (см. код лоадера) */
	getPostfixCode(thenCode?: string): string {
		let cfg = this.compiler.config;
		let params: any = {
			entryPoint: {
				module: this.getEntryModuleName(),
				function: cfg.entryFunction
			}
		};
		if(cfg.amdRequireName !== "require"){
			params.amdRequire = cfg.amdRequireName
		}
		if(cfg.commonjsRequireName !== "require"){
			params.commonjsRequire = cfg.commonjsRequireName;
		}
		if(cfg.preferCommonjs){
			params.preferCommonjs = true;
		}
		let paramStr = JSON.stringify(params);
		if(thenCode){
			paramStr = paramStr.substr(0, paramStr.length - 1) + `,${JSON.stringify("afterEntryPointExecuted")}:${thenCode}}`;
		}
		if(cfg.errorHandlerName){
			paramStr = paramStr.substr(0, paramStr.length - 1) + `,${JSON.stringify("errorHandler")}:${cfg.errorHandlerName}}`;
		}
		return ",\n" + paramStr + ",eval);"
	}

	private async loadAbsentModuleCode(): Promise<void> {
		let storage = this.compiler.metaStorage;
		let proms = [] as Promise<void>[];
		let names = storage.getNames();
		let outDir = this.compiler.config.tscParsedCommandLine.options.outDir as string;
		names.forEach(moduleName => {
			let mod = storage.get(moduleName);
			if(!mod.jsCode){
				let modulePath = path.join(outDir, moduleName + ".js");
				proms.push((async () => {
					let code = await readTextFile(modulePath);
					if(this.compiler.config.minify){
						code = await this.minify(code, moduleName);
					}
					mod.jsCode = code;
				})());
			}
		});
		if(proms.length > 0){
			await Promise.all(proms);
		}
	}

	private minify(code: string, moduleName: string, target?: tsc.ScriptTarget): Promise<string> {
		return minifyJsCode(code, target || tsc.ScriptTarget[this.compiler.config.target], moduleName);
	}

}