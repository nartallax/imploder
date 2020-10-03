import {ModuleMetadataStorage} from "module_meta_storage";
import {SeqSet} from "seq_set";

/** упорядочиватель файлов-результатов компиляции. определяет порядок их размещения в бандле */
export class ModuleOrderer {
	constructor(private readonly storage: ModuleMetadataStorage){}

	getModuleOrder(entryPointModule: string): { modules: string[], absentModules: string[], circularDependentRelatedModules: Set<string>}{
		let circularDependentRelatedModules = new Set<string>();
		let [modules, absentModules] = this.getSortedModules(entryPointModule, circularDependentRelatedModules);
		//let nonModules = this.getSortedNonModules(modules);
		modules.forEach(name => this.detectRecursiveRefExport(name));
		this.updateCircularRelatedModules(circularDependentRelatedModules);
		
		return { modules, absentModules, circularDependentRelatedModules }
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
		let nameStack = new SeqSet<string>();
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

	private getSortedModules(entryPoint: string, circularDependentRelatedModules: Set<string>): [string[], string[]] {
		let nameStack = new SeqSet<string>();
		let absentModules = new Set<string>();
		let result = new Set<string>();

		let visit = (name: string) => {
			if(nameStack.has(name)){
				this.unwindNameStack(nameStack, name).forEach(x => circularDependentRelatedModules.add(x));
				return;
			}
			if(!this.storage.has(name)){
				absentModules.add(name);
			} else {
				nameStack.push(name);
				result.add(name);
				this.storage.get(name).dependencies.forEach(dep => visit(dep));
				nameStack.pop();
			}
			
		}

		visit(entryPoint);

		return [
			[...result].sort((a, b) => a < b? -1: a > b? 1: 0),
			[...absentModules]
		]
	}

	// тут (и в методе выше) мы определяем, у каких модулей должна быть полная информация о зависимостях
	// полная информация о зависимостях = список экспортируемых имен + список модулей, имена из которых экспортируются as is
	// такие модули - это те, у которых есть циклическая зависимость (т.к. эта полная информация поможет нам её разрулить)
	// а также те модули, на которые ссылаются эти зацикленные модули с помощью, например, export * (такие попадают в exportRef-ы)
	// потому что без имен из этих сосланных модулей список экспортируемых имен будет неполон
	private updateCircularRelatedModules(s: Set<string>): void {
		let addRefs = (module: string) => this.storage.get(module).exportModuleReferences.forEach(add);
		let add = (module: string) => {
			s.add(module);
			addRefs(module);
		}

		for(let module of s){
			addRefs(module);
		}
	}

}