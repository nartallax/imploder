import {logDebug} from "utils/log";
import * as TSTool from "tstool";

export class ModuleStorageImpl implements TSTool.ModuleStorage {

	private readonly data: { [k: string]: TSTool.ModuleData } = {};

	set(name: string, data: TSTool.ModuleData){
		logDebug("Got info on " + name + " module: " + JSON.stringify(data));
		this.data[name] = data;
	}

	get(name: string): TSTool.ModuleData {
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