type ModuleDefinitonArray = ModuleDefinitonArrayMinimal | ModuleDefinitonArrayShort | ModuleDefinitonArrayFull;
type ModuleDefinitonArrayMinimal = [string, string];
type ModuleDefinitonArrayShort = [string, string[], string];
type ModuleDefinitonArrayFull = [string, string[], ModuleMetaShort, string];

type AmdRequire = (names: string[], onOk: (results: any[]) => void, onError?: (error: any) => void) => void;
type CommonjsRequire = (name: string) => any;

interface ModuleMetaShort {
	altName?: string;
	exports?: string[];
	exportRefs?: string[];
	arbitraryType?: true;
}

interface ModuleDefinition extends ModuleMetaShort {
	name: string;
	dependencies: string[];
	code: string;
}

interface LauncherParams {
	entryPoint: { module: string, function: string }
	afterEntryPointExecuted?: (error: Error | null, entryPointExecutionResult: any) => void;
	errorHandler?: (e: Error, action?: string) => void;
	amdRequire?: (name: string | string[], onOk: (...moduleData: any) => void, onError?: (error: any) => void) => void;
	commonjsRequire?: (name: string) => any;
	preferCommonjs?: boolean;
}

function tstoolLoader(defs: ModuleDefinitonArray[], params: LauncherParams, evl: (code: string) => any){
	"use strict";
	function handleError(e: Error, action?: string): never {
		if(params.errorHandler){
			params.errorHandler(e, action);
		} else {
			console.error("Error" + (action? " " + action: "") + ": " + (e.stack || e.message || e));
		}
		throw e;
	}

	// разбираем полученный массив определений
	let renames = {} as {[k: string]: string }
	let defMap = {} as {[k: string]: ModuleDefinition}

	for(let i = 0; i < defs.length; i++){
		let v = defs[i];
		let m: ModuleMetaShort | undefined = typeof(v[2]) !== "string"? v[2]: undefined;
		let def: Partial<ModuleDefinition> = m? m: {};
		def.name = v[0];
		def.code = v[v.length - 1] as string;

		if(m && m.altName){
			renames[m.altName] = def.name;
		}
		
		def.dependencies = Array.isArray(v[1])? v[1]: [];
		defMap[def.name] = def as ModuleDefinition;
	}

	let amdRequire: AmdRequire = params.amdRequire || (require as any as AmdRequire);
	let commonjsRequire: CommonjsRequire = params.commonjsRequire || require;

	/** функция, которую будут дергать в качестве require изнутри модулей */
	function requireAny(names: string | string[], onOk?: (...modules: any) => void, onError?: (error: Error) => void){
		if(Array.isArray(names) && !onOk){
			throw new Error("Passed array of module names to require (" + names.join(", ") + "), but provided no callback! This is inconsistent.");
		}

		if(!onOk){
			let name = names as string;
			if(name in defMap){
				return getProduct(name);
			} else {
				return commonjsRequire(name)
			}
		} else {
			try {
				let nameArr = Array.isArray(names)? names: [names];
				let results = {} as {[moduleName: string]: any};
				let externalNameArr = nameArr.filter(name => {
					if(name in defMap){
						results[name] = getProduct(name);
						return false;
					}
					return true;
				})

				let callOk = () => {
					let resultsArr = [] as any[];
					for(let i = 0; i < nameArr.length; i++){
						resultsArr.push(results[nameArr[i]]);
					}
					return onOk.apply(null, resultsArr);
				}

				if(externalNameArr.length === 0){
					return callOk();
				} else {
					return amdRequire(externalNameArr, function(externalResults){
						for(let i = 0; i < externalNameArr.length; i++){
							results[externalNameArr[i]] = externalResults[i]
						}
						callOk();
					}, onError);
				}
			} catch(e){
				if(onError){
					onError(e)
				} else {
					throw e;
				}
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
				let defFunc: Function = evl("'use strict';(" + meta.code + ")\n//# sourceURL=" + meta.name);
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

	function requireExternal(names: string[], onOk: (moduleVals: ArrayLike<any>) => void, onError: (error: Error) => void){
		if(params.preferCommonjs){
			try {
				onOk(names.map(name => commonjsRequire(name)))
			} catch(e){
				onError(e);
			}
		} else {
			amdRequire(names, function(){ onOk(arguments) }, onError);	
		}
	}

	function preloadExternalModules(entryPoint: string, onDone: () => void){
		let externalNames = discoverExternalModules(entryPoint);
		requireExternal(externalNames, externalValues => {
			externalNames.forEach((name, i) => {
				products[name] = externalValues[i];
			});
			onDone();
		}, handleError);
	}

	function start(){
		preloadExternalModules(params.entryPoint.module, () => {
			let mainProduct = getProduct(params.entryPoint.module);
			
			// инициализируем все модули в бандле, ради сайд-эффектов
			Object.keys(defMap).forEach(name => {
				if(!(name in products)){
					getProduct(name);
				}
			});

			let res: any = null;
			let err: Error | null = null;
			try {
				res = mainProduct[params.entryPoint.function].call(null);
			} catch(e){
				err = e;
			}
			if(params.afterEntryPointExecuted){
				params.afterEntryPointExecuted(err, res);
			}
		});
	}

	start();

}