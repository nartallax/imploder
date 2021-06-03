type AmdRequire = (names: string[], onOk: (results: any[]) => void, onError?: (error: any) => void) => void;
type AmdDefine = (deps: string[], definitor: (...modProducts: any) => any) => void;

interface ModuleDefinition extends ImploderModuleLoaderData {
	name: string;
	dependencies: string[];
	code: string;
}

interface LoaderParams {
	entryPoint: { module: string, function: string }
	entryPointArgs?: string[];
	afterEntryPointExecuted?: (error: Error | null, entryPointExecutionResult: any) => void;
	errorHandler?: (e: Error, action?: string) => void;
}

// в каких-то случаях в среде, где мы запускаемся, может быть requirejs, и он может определить define
declare const define: AmdDefine;

function imploderLoader(defs: ImploderModuleDefinitonArray[], params: LoaderParams, evl: (code: string) => any){
	let req: AmdRequire | NodeRequire = require;
	"use strict";
	function handleError(e: Error, action?: string): never {
		let handler = params.errorHandler
		if(handler){
			handler(e, action);
		} else {
			console.error((action? "Error during " + action + ": ": "") + (e.stack || e.message || e));
		}
		throw e;
	}

	// разбираем полученный массив определений
	let renames = {} as {[k: string]: string }
	let defMap = {} as {[k: string]: ModuleDefinition}

	for(let i = 0; i < defs.length; i++){
		let v = defs[i];
		let m: ImploderModuleLoaderData | undefined = typeof(v[2]) !== "string"? v[2]: undefined;
		let def: Partial<ModuleDefinition> = m? m: {};
		def.name = v[0];
		def.code = v[v.length - 1] as string;

		if(m && m.altName){
			renames[m.altName] = def.name;
		}
		
		def.dependencies = Array.isArray(v[1])? v[1]: [];
		defMap[def.name] = def as ModuleDefinition;
	}

	let amd: Boolean = typeof(define) === "function" && !!(define as any).amd;
	/** функция, которую будут дергать в качестве require изнутри модулей */
	function requireAny(names: string | string[], onOk?: (...modules: any) => void, onError?: (error: Error) => void){
		if(!onOk){
			// дернуты как commonjs, т.е. синхронно с одним именем
			let name = names as string;
			if(name in defMap){
				return getProduct(name);
			} else {
				// тут мы просто надеемся, что человек, который пишет код - не дурак
				// и знает, в каком окружении он будет запускаться
				// и поэтому просто дергаем require как commonjs синхронный require
				return (req as NodeRequire)(name);
			}
		} else {
			// дернуты как amd
			let callError = (e: Error) => {
				if(onError){
					onError(e);
				}
				handleError(e);
			}

			try {
				let nameArr = Array.isArray(names)? names: [names];
				let resultArr = [] as any[];
				let nameIndex = {} as {[moduleName: string]: any};

				let externalNameArr = nameArr.filter((name, index) => {
					nameIndex[name] = index;
					if(name in defMap){
						resultArr[index] = getProduct(name);
						return false;
					}
					return true;
				});

				if(externalNameArr.length === 0){
					return onOk(resultArr);
				} else {
					if(amd){
						return (req as AmdRequire)(externalNameArr, function(externalResults){
							for(let i = 0; i < externalNameArr.length; i++){
								resultArr[nameIndex[externalNameArr[i]]] = externalResults[i]
							}
							onOk(resultArr);
						}, onError);
					} else {
						// если у нас запросили модули асинхронно, но при этом у нас есть только синрохнный commonjs-овый require - 
						// то используем его, чего еще делать
						externalNameArr.forEach(name => resultArr[nameIndex[name]] = (req as NodeRequire)(name));
						onOk(resultArr);
					}
				}
			} catch(e){
				callError(e)
			}
		}
	}

	let currentlyDefiningProductMap = {} as {[name: string]: true};
	let currentlyDefiningProductSeq = [] as string[];
	let products = {} as {[name: string]: any};

	function throwCircularDependencyError(name: string): never {
		let str = name;
		for(let i = currentlyDefiningProductSeq.length - 1; i >= 0; i--){
			let n = currentlyDefiningProductSeq[i];
			str += " <- " + currentlyDefiningProductSeq[i];
			if(n === name)
				break;
		}
		throw new Error("Unresolvable circular dependency detected: " + str);
	}

	function getProduct(name: string): any {
		name = renames[name] || name;
		let meta = defMap[name];
		if(!(name in products)){
			if(name in currentlyDefiningProductMap){
				throwCircularDependencyError(name);
			}
			currentlyDefiningProductMap[name] = true;
			currentlyDefiningProductSeq.push(name);

			try {
				let product: any = {};
				let deps = [product, requireAny] as any[];
				meta.dependencies.forEach(name => {
					if(name in renames){
						name = renames[name];
					}
					let product = products[name];
					if(product){
						deps.push(product);
						return;
					}
					let depMeta = defMap[name];
					if(!depMeta){
						throw new Error("Failed to get module \"" + name + "\": no definition is known and no preloaded external module is present.");
					}
					deps.push(depMeta.arbitraryType || (!depMeta.exports && !depMeta.exportRefs)? getProduct(name): getProxy(depMeta));
				});
				let fullCode = meta.code;
				if(meta.nonModule){
					fullCode = "function(){" + fullCode + "}"
				}
				fullCode = "'use strict';(" + fullCode + ")\n//# sourceURL=" + meta.name;
				let defFunc: Function = evl(fullCode);
				let returnProduct = defFunc.apply(null, deps);
				if(meta.arbitraryType){
					product = returnProduct;
				}
				products[name] = product;
			} finally {
				delete currentlyDefiningProductMap[name];
				currentlyDefiningProductSeq.pop();
			}
		}
		return products[name];
	}

	let proxies = {} as {[name: string]: any}
	function getProxy(def: ModuleDefinition){
		if(!(def.name in proxies)){
			let proxy = {};
			getAllExportNames(def).forEach(arr => {
				arr.forEach(name => {
					defineProxyProp(def, proxy, name);
				});
			});
			proxies[def.name] = proxy;
		}
		return proxies[def.name];
	}

	function getAllExportNames(meta: ModuleDefinition, result: string[][] = [], noDefault: boolean = false): string[][]{
		if(meta.exports){
			if(noDefault){
				result.push(meta.exports.filter(_ => _ !== "default"));
			} else {
				result.push(meta.exports);
			}
		}
		if(meta.exportRefs){
			meta.exportRefs.forEach(ref => {
				// тут, теоретически, могла бы возникнуть бесконечная рекурсия
				// но не возникнет, еще при компиляции есть проверка
				getAllExportNames(defMap[ref], result, true);
			});
		}
		return result;
	}

	function defineProxyProp(meta: ModuleDefinition, proxy: Object, name: string): any {
		if(proxy.hasOwnProperty(name)){
			return;
		}
		Object.defineProperty(proxy, name, {
			get: () => getProduct(meta.name)[name],
			set: v => getProduct(meta.name)[name] = v,
			enumerable: true
		});
	}

	function discoverExternalModules(moduleName: string, result: string[] = [], visited: {[k: string]: true} = {}): string[] {
		if(moduleName in renames){
			moduleName = renames[moduleName];
		}
		if(!(moduleName in visited)){
			visited[moduleName] = true;
			if(moduleName in defMap){
				defMap[moduleName].dependencies.forEach(depName => discoverExternalModules(depName, result, visited));
			} else {
				result.push(moduleName);
			}
		}
		return result;
	}

	function afterExternalsLoaded(){
		let mainProduct = getProduct(params.entryPoint.module);
			
		// инициализируем все модули в бандле, ради сайд-эффектов
		Object.keys(defMap).forEach(name => {
			if(!(name in products)){
				getProduct(name);
			}
		});

		let res: any = null;
		let err: Error | null = null;
		if(params.entryPoint.function){
			try {
				res = mainProduct[params.entryPoint.function].apply(null, params.entryPointArgs || []);
			} catch(e){
				err = e;
			}
		}
		if(params.afterEntryPointExecuted){
			params.afterEntryPointExecuted(err, res);
		}

		if(typeof(module) === "object" && module.exports){
			module.exports = mainProduct;
		}

		return mainProduct;
	}

	function start(){
		if(amd){
			let externalModuleNames = ["require"];
			discoverExternalModules(params.entryPoint.module, externalModuleNames);
			define(externalModuleNames, function(require: AmdRequire){
				req = require;
				let modules = arguments as unknown as any[]; // почему typescript дает arguments такой странный тип?
				for(let i = externalModuleNames.length; i < modules.length; i++){
					products[externalModuleNames[i]] = modules[i];
				}
				return afterExternalsLoaded();
			});
		} else {
			let externalModuleNames = discoverExternalModules(params.entryPoint.module);
			requireAny(externalModuleNames, externalValues => {
				for(let i = 0; i < externalModuleNames.length; i++){
					products[externalModuleNames[i]] = externalValues[i];
				}
				afterExternalsLoaded();
			});
		}
	}

	start();

}