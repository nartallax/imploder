import {Imploder} from "imploder";

export class ModuleStorageImpl implements Imploder.ModuleStorage {

	private readonly data: { [k: string]: Imploder.ModuleData } = {};

	constructor(private readonly context: Imploder.Context){}

	set(name: string, data: Imploder.ModuleData){
		this.context.logger.debug("Got info on " + name + " module: " + JSON.stringify(data));
		this.data[name] = data;
	}

	get(name: string): Imploder.ModuleData {
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