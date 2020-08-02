import {OMap} from "utils";
import {logDebug} from "log";

export interface ModuleMeta {
	// множество имен модулей, от которых зависит данный (как amd-зависимости)
	dependencies: string[];

	// имеет ли этот модуль хотя бы один импорт или экспорт
	// если не имеет - то модуль считается за не-amd модуль (и вообще, строго говоря, не за модуль)
	// и к нему применяются несколько другие правила
	hasImportOrExport: boolean;

	// множество имен экспортируемых значений
	exports: string[];

	// модуль имеет конструкцию вида "export = "
	// принципиально тут то, что такой модуль может быть запрошен строго через require(), т.к. его результат может быть не объектом
	// (см. конструкцию вида import someName = require("my_module") )
	// т.о. ничто другое, кроме самого результата выполнения модуля, подставлено в качестве результата быть не может
	hasOmniousExport: boolean;

	// множество имен модулей, которые данный экспортирует через export * from "other_module_name"
	exportModuleReferences: string[];
	
	// альтернативное имя, по которому доступен данный модуль
	altName: string | null;

	// код модуля после компиляции
	jsCode: string | null;
}

/** хранилище метаданных о модулях */
export class ModuleMetadataStorage {

	private readonly data: OMap<ModuleMeta> = {};

	set(name: string, data: ModuleMeta){
		logDebug("Got info on " + name + " module: " + JSON.stringify(data));
		this.data[name] = data;
	}

	get(name: string): ModuleMeta {
		let res = this.data[name];
		if(!res)
			throw new Error("Module not found: " + name);
		return res;
	}
	
	deleteModule(name: string): void {
		delete this.data[name];
	}

	has(name: string): boolean {
		return name in this.data;
	}

	getNames(): string[] {
		return Object.keys(this.data);
	}

}