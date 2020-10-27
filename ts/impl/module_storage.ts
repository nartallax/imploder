import {logDebug} from "utils/log";

/** Хранилище всякой информации о модулях */
export interface ModuleStorage {
	set(name: string, data: ModuleData): void;
	get(name: string): ModuleData;
	delete(name: string): void;
	has(name: string): boolean;
	getKnownModuleNames(): string[];
}

/** Объект, описывающий один модуль */
export interface ModuleData {
	/** Множество имен модулей, от которых зависит данный (как amd-зависимости)
	* Идут в той же последовательности, что и аргументы функции, определяющей этот модуль */
	dependencies: string[];

	/** Имеет ли этот модуль хотя бы один импорт или экспорт
	* если не имеет - то модуль считается за не-amd модуль (и вообще, строго говоря, не за модуль)
	* и к нему применяются несколько другие правила */
	hasImportOrExport: boolean;

	/** Множество имен экспортируемых значений */
	exports: string[];

	/** Модуль имеет конструкцию вида "export = "
	* принципиально тут то, что такой модуль может быть запрошен строго через require(), т.к. его результат может быть не объектом
	* (см. конструкцию вида import someName = require("my_module") )
	* т.о. ничто другое, кроме самого результата выполнения модуля, подставлено в качестве результата быть не может */
	hasOmniousExport: boolean;

	/** Множество имен модулей, которые данный экспортирует через export * from "other_module_name" */
	exportModuleReferences: string[];
	
	/** Альтернативное имя, по которому доступен данный модуль */
	altName: string | null;

	/** Код модуля после компиляции */
	jsCode: string | null;
}

export class ModuleStorageImpl implements ModuleStorage {

	private readonly data: { [k: string]: ModuleData } = {};

	set(name: string, data: ModuleData){
		logDebug("Got info on " + name + " module: " + JSON.stringify(data));
		this.data[name] = data;
	}

	get(name: string): ModuleData {
		let res = this.data[name];
		if(!res)
			throw new Error("Module not found: " + name);
		return res;
	}
	
	delete(name: string): void {
		delete this.data[name];
	}

	has(name: string): boolean {
		return name in this.data;
	}

	getKnownModuleNames(): string[] {
		return Object.keys(this.data);
	}

}