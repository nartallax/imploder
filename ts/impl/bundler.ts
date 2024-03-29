import * as Tsc from "typescript"
import {ModuleOrderer} from "impl/module_orderer"
import {loaderCode} from "generated/loader_code"
import * as Path from "path"
import {promises as Fs} from "fs"
import {minifyJsFunctionExpression, MinifierOptions} from "impl/minification"
import {Imploder} from "imploder"

export class BundlerImpl implements Imploder.Bundler {

	private moduleOrderer: ModuleOrderer | null = null

	constructor(private readonly context: Imploder.Context) {}

	async produceBundle(): Promise<string> {
		this.context.logger.debug("Starting to produce bundle.")
		let code = await this.assembleBundleCode()
		await Fs.mkdir(Path.dirname(this.context.config.outFile), {recursive: true})
		await Fs.writeFile(this.context.config.outFile, code, "utf-8")
		this.context.logger.debug("Bundle produced (" + this.context.config.outFile + ")")
		return code
	}

	async assembleBundleCode(): Promise<string> {
		if(!this.context.compiler.lastBuildWasSuccessful){
			throw new Error("Last build was not successful! Could not produce bundle.")
		}

		let result = [] as string[]

		await this.loadAbsentModuleCode()

		let moduleOrderer = this.moduleOrderer ||= new ModuleOrderer(
			this.context.moduleStorage,
			this.context.config.moduleBlacklistRegexp || [],
			this.context.config.moduleWhitelistRegexp || [],
		)
		let moduleOrder = this.context.config.preventModuleTreePruning
			? moduleOrderer.getUnprunedModuleOrder(this.getEntryModuleName())
			: moduleOrderer.getPrunedModuleOrder(this.getEntryModuleName())

		let defArrArr = this.buildModuleDefinitionArrayArray(moduleOrder.orderedModules, moduleOrder.circularDependentRelatedModules)
		if(this.context.config.embedTslib && moduleOrder.absentModules.has("tslib")){
			defArrArr.push(await this.getTslibDefArr())
		}
		result.push(JSON.stringify(defArrArr))

		let code = result.join("\n")
		if(!this.context.config.noLoaderCode){
			code = await this.wrapBundleCode(code)
		}

		return code
	}

	async wrapBundleCode(bareCode: string, otherParams: Imploder.BundlerWrapperParameters = {}): Promise<string> {
		return [
			await this.getPrefixCode(),
			bareCode,
			this.getPostfixCode(otherParams)
		].join("\n")
	}

	private getEntryModuleName(): string {
		let absPath = Path.resolve(Path.dirname(this.context.config.tsconfigPath), this.context.config.entryModule)
		let name = this.context.modulePathResolver.getCanonicalModuleName(absPath)
		return name
	}

	private async getTslibDefArr(): Promise<ImploderModuleDefinitonArray> {
		let tslibjsPath = require.resolve("tslib", {paths: [Path.dirname(this.context.config.tsconfigPath)]})
		let libCode = await Fs.readFile(tslibjsPath, "utf-8")
		// оборачиваем код tslib в функцию типа определение модуля
		// чтобы с ним можно было обращаться так же, как с любым другим модулем
		libCode = "function(global){var define=function(){};" + libCode + "}"
		if(this.context.config.minify){
			libCode = await this.minify(libCode, "tslib", {removeLegalComments: true})
		}
		return ["tslib", libCode]
	}

	private buildModuleDefinitionArrayArray(modules: string[], circularDependentRelatedModules: Set<string>): ImploderModuleDefinitonArray[] {
		return modules.map(name => {
			let meta = this.context.moduleStorage.get(name)
			let code = meta.jsCode
			if(!code){
				throw new Error("Code for module " + name + " is not loaded at bundling time.")
			}

			let shouldIncludeFullExportInfo = circularDependentRelatedModules.has(name)
			let haveModuleRefs = meta.exportModuleReferences.length > 0 && shouldIncludeFullExportInfo
			let needExports = meta.exports.length > 0 && shouldIncludeFullExportInfo
			if(needExports || !!meta.altName || meta.hasOmniousExport || haveModuleRefs || !meta.isModuleFile){

				let short: ImploderModuleLoaderData = {}
				if(haveModuleRefs){
					short.exportRefs = meta.exportModuleReferences.sort()
				}
				if(needExports){
					short.exports = meta.exports.sort()
				}
				if(meta.hasOmniousExport){
					short.arbitraryType = true
				}
				if(meta.altName){
					short.altName = meta.altName
				}
				if(!meta.isModuleFile){
					short.nonModule = true
				}

				return [name, meta.dependencies, short, code]
			} else {
				return meta.dependencies.length > 0 ? [name, meta.dependencies, code] : [name, code]
			}
		})
	}

	private minifiedLoaderCode: string | null = null
	private async getPrefixCode(): Promise<string> {
		let resultLoaderCode = loaderCode
		if(this.context.config.minify){
			if(this.minifiedLoaderCode === null){
				this.minifiedLoaderCode = await this.minify(resultLoaderCode, "<loader>", {
					target: Tsc.ScriptTarget.ES5
				})
			}
			resultLoaderCode = this.minifiedLoaderCode
		}
		resultLoaderCode = resultLoaderCode.replace(/;?[\n\s]*$/, "")
		return "(" + resultLoaderCode + ")(\n"
	}

	/* получить код, который должен стоять в бандле после перечисления определения модулей
	thenCode - код, который будет передан в качестве аргумента в launch (см. код лоадера) */
	private getPostfixCode(wrapParams: Imploder.BundlerWrapperParameters): string {
		let cfg = this.context.config
		let params: LoaderParams = {
			entryPoint: {
				module: this.getEntryModuleName(),
				function: cfg.entryFunction
			}
		}
		let paramStr = JSON.stringify(params)
		if(wrapParams.entryPointArgCode){
			paramStr = paramStr.substr(0, paramStr.length - 1)
				+ `,${JSON.stringify("entryPointArgs")}:[${wrapParams.entryPointArgCode.join(",")}]}`
		}
		if(cfg.errorHandlerName){
			paramStr = paramStr.substr(0, paramStr.length - 1)
				+ `,${JSON.stringify("errorHandler")}:${cfg.errorHandlerName}}`
		}
		return ",\n" + paramStr + ",eval);"
	}

	private async loadAbsentModuleCode(): Promise<void> {
		let storage = this.context.moduleStorage
		let proms = [] as Promise<void>[]
		let names = storage.getKnownModuleNames()
		let outDir = this.context.config.tscParsedCommandLine.options.outDir as string
		names.forEach(moduleName => {
			let mod = storage.get(moduleName)
			if(!mod.jsCode){
				let modulePath = Path.join(outDir, moduleName + ".js")
				proms.push((async() => {
					let code = await Fs.readFile(modulePath, "utf-8")
					if(this.context.config.minify){
						code = await this.minify(code, moduleName, {}, mod.isModuleFile)
					}
					mod.jsCode = code
				})())
			}
		})
		if(proms.length > 0){
			await Promise.all(proms)
		}
	}

	private minify(code: string, moduleName: string, opts: Partial<MinifierOptions> = {}, isModuleDef = true): Promise<string> {
		return minifyJsFunctionExpression({
			isModuleDef,
			target: Tsc.ScriptTarget[this.context.config.target],
			...opts,
			code,
			moduleName,
			overrides: this.context.config.minificationOverrides
		}, this.context)
	}

}