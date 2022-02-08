import {SeqSet} from "utils/seq_set"
import {Imploder} from "imploder"
import {findAllCycledNodesInGraph} from "impl/graph_cycle_finder"

export interface IncludedOrderedModules {
	orderedModules: string[]
	includedModules: Set<string>
	absentModules: Set<string>
	circularDependentRelatedModules: Set<string>
}

/** упорядочиватель файлов-результатов компиляции. определяет порядок их размещения в бандле */
export class ModuleOrderer {
	private readonly blacklistRegexps: RegExp[]
	private readonly whitelistRegexps: RegExp[]

	constructor(private readonly storage: Imploder.ModuleStorage,
		blacklists: string[],
		whitelists: string[]) {
		this.blacklistRegexps = blacklists.map(x => new RegExp(x))
		this.whitelistRegexps = whitelists.map(x => new RegExp(x))
	}

	getPrunedModuleOrder(entryPointModule: string): IncludedOrderedModules {
		return this.getModuleOrder(entryPointModule, () => this.getSortedPrunedModules(entryPointModule))
	}

	getUnprunedModuleOrder(entryPointModule: string): IncludedOrderedModules {
		return this.getModuleOrder(entryPointModule, () => this.getSortedAllModules(entryPointModule))
	}

	private getModuleOrder(entryPointModule: string, getBase: () => IncludedOrderedModules): IncludedOrderedModules {
		if(!this.storage.has(entryPointModule)){
			throw new Error(`Could not order modules: entry point module (${entryPointModule}) is not found.`)
		}
		let result = getBase()
		result.orderedModules.forEach(name => this.detectRecursiveRefExport(name))

		result.circularDependentRelatedModules = new Set(
			this.detectCircularDependentModules(result.orderedModules)
		)
		this.updateCircularRelatedModules(result.circularDependentRelatedModules)

		let {blacklistedModules, nonWhitelistedModules} = this.findBannedModules(result.orderedModules)
		if(blacklistedModules.length > 0 || nonWhitelistedModules.length > 0){
			let message = "Bundle includes some modules that must not be included:"
			if(blacklistedModules.length > 0){
				message += " " + blacklistedModules.join(", ") + " (excluded by blacklist);"
			}
			if(nonWhitelistedModules.length > 0){
				message += " " + nonWhitelistedModules.join(", ") + " (not included in whitelist);"
			}
			throw new Error(message)
		}

		return result
	}

	private unwindNameStack(nameStack: SeqSet<string>, name: string): string[] {
		let referenceCircle = [name]
		let vals = nameStack.seq
		for(let i = vals.length - 1; i >= 0; i--){
			let v = vals[i]
			referenceCircle.push(v)
			if(v === name){
				break
			}
		}
		return referenceCircle
	}

	private detectRecursiveRefExport(entryPoint: string): void | never {
		let nameStack = new SeqSet<string>(undefined, true)
		let visit = (name: string) => {
			if(nameStack.has(name)){
				throw new Error("Recursive \"export *\" detected: " + this.unwindNameStack(nameStack, name).join(" <- "))
			}

			nameStack.push(name)
			if(this.storage.has(name)){
				this.storage.get(name).exportModuleReferences.forEach(dep => visit(dep))
			}
			nameStack.pop()
		}

		visit(entryPoint)
	}

	/** Получить сортированные списки используемых и отсутствующих модулей */
	private getSortedPrunedModules(entryPoint: string): IncludedOrderedModules {
		let absentModules = new Set<string>()
		let result = new Set<string>()

		let visit = (name: string) => {
			if(result.has(name)){
				return
			}
			if(!this.storage.has(name)){
				absentModules.add(name)
			} else {
				result.add(name)
				this.storage.get(name).dependencies.forEach(dep => visit(dep))
			}
		}

		visit(entryPoint)

		return {
			orderedModules: this.sortModules([...result]),
			includedModules: result,
			circularDependentRelatedModules: new Set(),
			absentModules
		}
	}

	private getSortedAllModules(entryPoint: string): IncludedOrderedModules {
		let result = this.getSortedPrunedModules(entryPoint)
		this.storage.getKnownModuleNames().forEach(name => {
			if(result.includedModules.has(name)){
				return
			}

			if(!this.storage.has(name)){
				result.absentModules.add(name)
			}

			if(this.canIncludeModuleByLists(name)){
				result.includedModules.add(name)
				result.orderedModules.push(name)
			}
		})
		result.orderedModules = this.sortModules(result.orderedModules)
		return result
	}

	private sortModules(modules: string[]): string[] {
		return modules.sort((a, b) => a < b ? -1 : a > b ? 1 : 0)
	}

	/** Найти среди переданных все модули, которые участвуют в циклических ссылках */
	private detectCircularDependentModules(allModules: string[]): string[] {
		let srcGraph: [string, string[]][] = allModules
			.map(id => [id, this.storage.get(id).dependencies])

		return findAllCycledNodesInGraph(srcGraph)
	}

	// тут мы определяем, у каких модулей должна быть полная информация о зависимостях
	// полная информация о зависимостях = список экспортируемых имен + список модулей, имена из которых экспортируются as is
	// такие модули - это те, у которых есть циклическая зависимость (т.к. эта полная информация поможет нам её разрулить)
	// а также те модули, на которые ссылаются эти зацикленные модули с помощью, например, export * (такие попадают в exportRef-ы)
	// потому что без имен из этих сосланных модулей список экспортируемых имен будет неполон
	private updateCircularRelatedModules(s: Set<string>): void {
		let addRefs = (module: string) => {
			if(this.storage.has(module)){
				// модуля может не быть, если это внешний модуль
				this.storage.get(module).exportModuleReferences.forEach(add)
			}
		}

		let add = (module: string) => {
			s.add(module)
			addRefs(module)
		}

		for(let module of s){
			addRefs(module)
		}
	}

	findBannedModules(names: string[]): {blacklistedModules: string[], nonWhitelistedModules: string[]} {
		let blacklistedModules = [] as string[]
		{
			let regexps = this.blacklistRegexps
			if(regexps.length > 0){
				names.forEach(name => {
					for(let regexp of regexps){
						if(regexp.test(name)){
							blacklistedModules.push(name)
							return
						}
					}
				})
			}
		}

		let nonWhitelistedModules = [] as string[]
		{
			let regexps = this.whitelistRegexps
			if(regexps.length > 0){
				names.forEach(name => {
					for(let regexp of regexps){
						if(regexp.test(name)){
							return
						}
					}
					nonWhitelistedModules.push(name)
				})
			}
		}

		return {blacklistedModules, nonWhitelistedModules}
	}

	private canIncludeModuleByLists(moduleName: string): boolean {
		for(let reg of this.blacklistRegexps){
			if(reg.test(moduleName)){
				return false
			}
		}

		if(this.whitelistRegexps.length > 0){
			for(let reg of this.whitelistRegexps){
				if(reg.test(moduleName)){
					return true
				}
			}
			return false
		}

		return true
	}

}