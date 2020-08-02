import {Compiler} from "compiler";
import {ModuleOrderer} from "module_orderer";
import {ModuleMeta} from "module_meta_storage";
import {loaderCode} from "generated/loader_code";
import {logDebug} from "log";
import * as path from "path";
import {readTextFile} from "afs";

/** сборщик бандл-файла из кучи исходников */
export class Bundler {

	private readonly compiler: Compiler;

	constructor(compiler: Compiler){
		this.compiler = compiler;
	}

	async produceBundle(): Promise<string>{
		let result = ["\"use strict\";"];
		if(!this.compiler.noLoaderCode){
			result.push(this.getPrefixCode());
		}

		await this.loadAbsentModuleCode();

		let moduleOrder = new ModuleOrderer(this.compiler.metaStorage).getModuleOrder(this.compiler.entryModule);
		logDebug("Bundle related modules: " + JSON.stringify(moduleOrder))

		moduleOrder.modules.forEach(name => {
			let meta = this.compiler.metaStorage.get(name);
			let code = meta.jsCode;
			if(!code){
				throw new Error("Code for module " + name + " is not loaded at bundling time.");
			}
			result.push(this.getModuleEvalCode(name, meta, code));
		});
		
		if(!this.compiler.noLoaderCode){
			result.push(this.getPostfixCode());
		}

		return result.join("\n");
	}

	private getModuleEvalCode(name: string, meta: ModuleMeta, code: string): string{
		let data: ModuleMetaShort = { name: name };

		if(meta.exports.length > 0){
			data.exports = meta.exports;
		}

		if(meta.exportModuleReferences.length > 0){
			data.exportRefs = meta.exportModuleReferences;
		}
		if(meta.hasOmniousExport){
			data.arbitraryType = true;
		}
		return `define.e(${JSON.stringify(data)},${JSON.stringify(code)});`
	}

	private getLoaderPostfixCode(): string {
		return [
			!this.compiler.errorHandlerName? null: `define.errorHandler=${this.compiler.errorHandlerName};`,
			`define.amdRequire=${this.compiler.amdRequireName};`,
			`define.commonjsRequire=${this.compiler.commonjsRequireName};`,
			`define.preferCommonjs=${this.compiler.preferCommonjs? "true": "false"};`
		].filter(_ => !!_).join("\n")
	} 

	getPrefixCode(): string {
		return loaderCode + "\n" + this.getLoaderPostfixCode();
	}

	/* получить код, который должен стоять в бандле после перечисления определения модулей
	thenCode - код, который будет передан в качестве аргумента в launch (см. код лоадера) */
	getPostfixCode(thenCode?: string): string {
		return `define.launch(${JSON.stringify(this.compiler.entryModule)},${JSON.stringify(this.compiler.entryFunction)}${thenCode? "," + thenCode: ""});`
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
					// почему я получаю список зависимостей именно так?
					// потому что тогда в него не попадают зависимости, из которых нужны только типы, но не значения
					// альтернатива этому - анализировать код на этапе трансформации
					// но это долго, сложно и будут ошибки, так что проще так
					discoverModuleDependencies(mod, moduleName);
				})());
			}
		});
		if(proms.length > 0){
			await Promise.all(proms);
		}
	}

}

function discoverModuleDependencies(meta: ModuleMeta, moduleName: string): void {
	if(!meta.hasImportOrExport){
		// у не-модульных файлов с кодом нечего особо дисковерить, скипаем
		return;
	}

	let result: string[] | null = null;
	function define(deps: string[]){
		if(result){
			throw new Error("Uncorrect module code for " + moduleName + ": expected no more than one invocation of define().");
		}
		result = deps.filter(_ => _ !== "exports" && _ !== "require");
	}
	void define;
	if(!meta.jsCode){
		throw new Error("Could not discover dependencies of module " + moduleName + ": no code loaded.");
	}
	eval(meta.jsCode);
	if(!result){
		throw new Error("Uncorrect module code for " + moduleName + ": expected at least one invocation of define().");
	}
	meta.dependencies = result;
}

export interface ModuleMetaShort {
	name: string;
	exports?: string[];
	exportRefs?: string[];
	arbitraryType?: true;
}