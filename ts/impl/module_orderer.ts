import {SeqSet} from "utils/seq_set";
import {Imploder} from "imploder";
import {findAllCycledNodesInGraph} from "impl/graph_cycle_finder";

/** упорядочиватель файлов-результатов компиляции. определяет порядок их размещения в бандле */
export class ModuleOrderer {
	constructor(private readonly storage: Imploder.ModuleStorage){}

	getModuleOrder(entryPointModule: string): { modules: string[], absentModules: Set<string>, circularDependentRelatedModules: Set<string>}{
		if(!this.storage.has(entryPointModule)){
			throw new Error(`Could not order modules: entry point module (${entryPointModule}) is not found.`);
		}
		let [modules, absentModules] = this.getSortedModules(entryPointModule);
		modules.forEach(name => this.detectRecursiveRefExport(name));
		let circularDependentModules = new Set(this.detectCircularDependentModules(modules))
		this.updateCircularRelatedModules(circularDependentModules);
		
		return { modules, absentModules, circularDependentRelatedModules: circularDependentModules }
	}

	private unwindNameStack(nameStack: SeqSet<string>, name: string): string[]{
		let referenceCircle = [name];
		let vals = nameStack.seq;
		for(let i = vals.length - 1; i >= 0; i--){
			let v = vals[i];
			referenceCircle.push(v);
			if(v === name){
				break;
			}
		}
		return referenceCircle;
	}

	private detectRecursiveRefExport(entryPoint: string){
		let nameStack = new SeqSet<string>(undefined, true);
		let visit = (name: string) => {
			if(nameStack.has(name)){
				throw new Error("Recursive \"export *\" detected: " + this.unwindNameStack(nameStack, name).join(" <- "));
			}

			nameStack.push(name);
			if(this.storage.has(name)){
				this.storage.get(name).exportModuleReferences.forEach(dep => visit(dep));
			}
			nameStack.pop();
		}

		visit(entryPoint);
	}

	/** Получить сортированные списки используемых и отсутствующих модулей */
	private getSortedModules(entryPoint: string): [string[], Set<string>] {
		let absentModules = new Set<string>();
		let result = new Set<string>();

		let visit = (name: string) => {
			if(result.has(name)){
				return;
			}
			if(!this.storage.has(name)){
				absentModules.add(name);
			} else {
				result.add(name);
				this.storage.get(name).dependencies.forEach(dep => visit(dep));
			}
		}

		visit(entryPoint);

		return [
			[...result].sort((a, b) => a < b? -1: a > b? 1: 0),
			absentModules
		]
	}

	/** Найти среди переданных все модули, которые участвуют в циклических ссылках */
	private detectCircularDependentModules(allModules: string[]): string[] {
		let srcGraph: [string, string[]][] = allModules
			.map(id => [id, this.storage.get(id).dependencies]);

		return findAllCycledNodesInGraph(srcGraph);
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
				this.storage.get(module).exportModuleReferences.forEach(add);
			}
		}

		let add = (module: string) => {
			s.add(module);
			addRefs(module);
		}

		for(let module of s){
			addRefs(module);
		}
	}

}