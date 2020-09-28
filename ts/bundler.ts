import {Compiler} from "compiler";
import {ModuleOrderer} from "module_orderer";
import {loaderCode} from "generated/loader_code";
import {logDebug} from "log";
import * as path from "path";
import {readTextFile} from "afs";
import {ModuleMetaShort, ModuleDefinitonArray} from "loader/loader_types";

/** сборщик бандл-файла из кучи исходников */
export class Bundler {

	private readonly compiler: Compiler;

	constructor(compiler: Compiler){
		this.compiler = compiler;
	}

	async produceBundle(): Promise<string>{
		let result = [] as string[];
		if(!this.compiler.noLoaderCode){
			result.push(this.getPrefixCode());
		}

		await this.loadAbsentModuleCode();

		let moduleOrder = new ModuleOrderer(this.compiler.metaStorage).getModuleOrder(this.compiler.entryModule);
		logDebug("Bundle related modules: " + JSON.stringify(moduleOrder))

		let defArrArr = this.buildModuleDefinitionArrayArray(moduleOrder.modules, moduleOrder.circularDependentModules);
		result.push(JSON.stringify(defArrArr));
		
		if(!this.compiler.noLoaderCode){
			result.push(this.getPostfixCode());
		}

		return result.join("\n");
	}

	private buildModuleDefinitionArrayArray(modules: string[], circularDependentModules: Set<string>): ModuleDefinitonArray[] {
		return modules.map(name => {
			let meta = this.compiler.metaStorage.get(name);
			let code = meta.jsCode;
			if(!code){
				throw new Error("Code for module " + name + " is not loaded at bundling time.");
			}

			let haveModuleRefs = meta.exportModuleReferences.length > 0;
			let needExports = meta.exports.length > 0 && circularDependentModules.has(name)
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

	getPrefixCode(): string {
		return loaderCode.replace(/;?[\n\s]*$/, "") + "(\n";
	}

	/* получить код, который должен стоять в бандле после перечисления определения модулей
	thenCode - код, который будет передан в качестве аргумента в launch (см. код лоадера) */
	getPostfixCode(thenCode?: string): string {
		let params: any = {
			entryPoint: {
				module: this.compiler.entryModule,
				function: this.compiler.entryFunction
			}
		};
		if(this.compiler.errorHandlerName){
			params.errorHandler = this.compiler.errorHandlerName;
		}
		if(this.compiler.amdRequireName !== "require"){
			params.amdRequire = this.compiler.amdRequireName
		}
		if(this.compiler.commonjsRequireName !== "require"){
			params.commonjsRequire = this.compiler.commonjsRequireName;
		}
		if(this.compiler.preferCommonjs){
			params.preferCommonjs = true;
		}
		let paramStr = JSON.stringify(params);
		if(thenCode){
			paramStr = paramStr.substr(0, paramStr.length - 1) + `,${JSON.stringify("afterEntryPointExecuted")}:${thenCode}}`;
		}
		return ",\n" + paramStr + ");"
	}

	private async loadAbsentModuleCode(): Promise<void> {
		let storage = this.compiler.metaStorage;
		let proms = [] as Promise<void>[];
		let names = storage.getNames();
		names.forEach(moduleName => {
			let mod = storage.get(moduleName);
			if(!mod.jsCode){
				let modulePath = path.join(this.compiler.outDir, moduleName + ".js");
				proms.push((async () => {
					let code = await readTextFile(modulePath);
					mod.jsCode = code;
				})());
			}
		});
		if(proms.length > 0){
			await Promise.all(proms);
		}
	}

}