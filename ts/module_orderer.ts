import {ModuleMetadataStorage} from "module_meta_storage";
import {SeqSet} from "seq_set";

/** упорядочиватель файлов-результатов компиляции. определяет порядок их размещения в бандле */
export class ModuleOrderer {
	constructor(private readonly storage: ModuleMetadataStorage){}

	getModuleOrder(entryPointModule: string): { modules: string[], absentModules: string[], circularDependentModules: Set<string>}{
		let circularDependentModules = new Set<string>();
		let [modules, absentModules] = this.getSortedModules(entryPointModule, circularDependentModules);
		//let nonModules = this.getSortedNonModules(modules);
		modules.forEach(name => this.detectRecursiveRefExport(name));
		
		return { modules, absentModules, circularDependentModules }
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

	private getSortedModules(entryPoint: string, circularDependencyModules: Set<string>): [string[], string[]] {
		let nameStack = new SeqSet<string>();
		let absentModules = new Set<string>();
		let result = [] as string[];

		let visit = (name: string) => {
			if(nameStack.has(name)){
				this.unwindNameStack(nameStack, name).forEach(x => circularDependencyModules.add(x));
				return;
			}
			if(!this.storage.has(name)){
				absentModules.add(name);
			} else {
				nameStack.push(name);
				result.push(name);
				this.storage.get(name).dependencies.forEach(dep => visit(dep));
				nameStack.pop();
			}
			
		}

		visit(entryPoint);

		return [
			result.sort((a, b) => a < b? -1: a > b? 1: 0),
			[...absentModules]
		]
	}

}