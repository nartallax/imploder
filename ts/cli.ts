import {logError} from "log";

type ErrorHandler = (e: Error) => never;
type HelpShower = (lines: string[]) => void;

export interface CliArgDef<V> {
	readonly default?: V;
	readonly allowedValues?: readonly V[];
	readonly keys: string[];
	readonly definition?: string;
	readonly isHelp?: boolean;
	readonly type: "string" | "int" | "double" | "bool";
}

export interface CliParams<T> {
	readonly helpHeader?: string;
	readonly onError?: ErrorHandler;
	readonly showHelp?: HelpShower;
	readonly definition: { readonly [k in keyof(T)]: CliArgDef<T[k]> };
}

export class CLI<T> {

	static get processArgvWithoutExecutables(): readonly string[] {
		return process.argv.slice(2);
	}

	static defaultHelpPrinter(lines: string[]): never {
		lines.forEach(line => console.error(line));
		return process.exit(1);
	}

	static printErrorAndExit(error: Error): never {
		logError(error.message);
		return process.exit(1);
	}

	static str<T = string>(params: {keys: string | readonly string[], definition?: string, allowedValues?: readonly T[], default?: T}): CliArgDef<T>{
		return {
			default: params.default,
			keys: Array.isArray(params.keys)? params.keys: [params.keys],
			allowedValues: params.allowedValues,
			definition: params.definition,
			type: "string"
		}
	}

	static bool(params: {keys: string | readonly string[], definition?: string}): CliArgDef<boolean>{
		return {
			default: false,
			keys: Array.isArray(params.keys)? params.keys: [params.keys],
			definition: params.definition,
			type: "bool"
		}
	}

	static help(params: {keys: string | readonly string[], definition?: string}): CliArgDef<boolean>{
		return {
			default: false,
			keys: Array.isArray(params.keys)? params.keys: [params.keys],
			definition: params.definition,
			isHelp: true,
			type: "bool"
		}
	}

	static double(params: {keys: string | string[], definition?: string, allowedValues?: number[], default?: number}): CliArgDef<number>{
		return {
			default: params.default,
			keys: Array.isArray(params.keys)? params.keys: [params.keys],
			allowedValues: params.allowedValues,
			definition: params.definition,
			type: "double"
		}
	}

	static int(params: {keys: string | string[], definition?: string, allowedValues?: number[], default?: number}): CliArgDef<number>{
		return {
			default: params.default,
			keys: Array.isArray(params.keys)? params.keys: [params.keys],
			allowedValues: params.allowedValues,
			definition: params.definition,
			type: "int"
		}
	}

	readonly params: CliParams<T>;

	constructor(params: CliParams<T>){
		this.params = params;
	}

	private fail(msg: string): never {
		return (this.params.onError || CLI.printErrorAndExit)(new Error(msg));
	}

	private printHelp(): void {
		let helpLines = this.params.helpHeader? [this.params.helpHeader]: [];

		let argNames = Object.keys(this.params.definition) as (string & keyof(T))[];

		let keyPart = (argName: string & keyof(T)) => {
			let def = this.params.definition[argName];
			return def.keys.join(", ") + " (" + def.type + ")"
		}

		let maxKeyLength: number = argNames.map(argName => keyPart(argName).length).reduce((a, b) => Math.max(a, b), 0);
		
		argNames.forEach(argName => {
			let def = this.params.definition[argName];
			let line = keyPart(argName);
			while(line.length < maxKeyLength)
				line += " ";
			if(def.definition){
				line += ": " + def.definition
			}
			if(def.allowedValues){
				line += " Allowed values: " + def.allowedValues.join(", ") + "."
			}
			helpLines.push(line);
		});

		(this.params.showHelp || CLI.defaultHelpPrinter)(helpLines);
	}

	private buildKeysMap(): Map<string, string & keyof(T)>{
		let result = new Map<string, string & keyof(T)>();
		(Object.keys(this.params.definition) as (string & keyof(T))[]).forEach(argName => {
			let keys = this.params.definition[argName].keys;
			if(keys.length === 0){
				this.fail("CLI argument \"" + argName + "\" has no keys with which it could be passed.");
			}

			keys.forEach(key => {
				if(result.has(key)){
					this.fail("CLI argument key \"" + key + "\" is bound to more than one argument: \"" + argName + "\", \"" + result.get(key) + "\".")
				}
				result.set(key, argName);
			});
		});

		return result;
	}

	/** основной метод CLI. парсит все значения CLI.
	 * если нужно показать помощь - показывает.
	 * возвращает объект с распаршенными данными */
	parseArgs(values: readonly string[] = CLI.processArgvWithoutExecutables): T {
		let result = this.extract(values);

		let haveHelp = false;
		let abstentMandatories: string[] = [];

		(Object.keys(this.params.definition) as (string & keyof(T))[]).forEach(argName => {
			let def = this.params.definition[argName];

			if(def.isHelp && !!result[argName]){
				haveHelp = true;
			}

			if(argName in result){
				if(def.allowedValues){
					let s = new Set(def.allowedValues);
					if(!s.has(result[argName] as any)){
						this.fail("Value of CLI argument \"" + argName + "\" is not in allowed values set: it's \"" + result[argName] + ", while allowed values are " + def.allowedValues.map(x => "\"" + x + "\"").join(", "));
					}
				}
				return;
			}

			if(def.default !== undefined){
				result[argName] = def.default;
			} else {
				abstentMandatories.push(argName);
			}
		});

		if(haveHelp){
			this.printHelp();
		}

		if(abstentMandatories.length > 0){
			this.fail("Some mandatory CLI arguments are absent: " + abstentMandatories.map(x => "\"" + x + "\"").join(", "));
		}
		
		return result as T;
	}

	private extract(values: readonly string[]): Partial<T>{
		let knownArguments = new Set<string & keyof(T)>();
		let keyToArgNameMap = this.buildKeysMap();

		let result = {} as Partial<T>;

		for(let i = 0; i < values.length; i++){
			let v = values[i];
			if(!keyToArgNameMap.has(v)){
				this.fail("Unknown CLI argument key: \"" + v + "\".");
			}

			let argName = keyToArgNameMap.get(v) as string & keyof(T);
			if(knownArguments.has(argName)){
				this.fail("CLI argument \"" + argName + "\" passed more than once, last time with key \"" + v + "\".");
			}
			knownArguments.add(argName);

			let actualValue: any;
			let def = this.params.definition[argName];
			switch(def.type){
				case "bool":
					actualValue = true;
					break;
				case "string":
				case "int":
				case "double":
					if(i === values.length - 1){
						this.fail("Expected to have some value after CLI key \"" + v + "\".");
					}
					i++;
					actualValue = values[i];

					if(def.type === "int" || def.type === "double"){
						let num = parseFloat(actualValue);
						if(!Number.isFinite(num)){
							this.fail("Expected to have number after CLI key \"" + v + "\", got \"" + actualValue + "\" instead.");
						}

						if(def.type === "int" && (num % 1) !== 0){
							this.fail("Expected to have integer number after CLI key \"" + v + "\", got \"" + actualValue + "\" instead (it's fractional).");
							
						}

						actualValue = num;
					}
			}

			(result[argName] as any) = actualValue;
		}

		return result;
	}



}