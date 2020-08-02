interface ModuleMetaRuntime {
	name: string;
	exports?: string[];
	exportRefs?: string[];
	arbitraryType?: true;
	dependencies: string[];
	definitor: () => any;
	proxy?: any;
	product?: any;
	external?: true;
}

type DefineOverloadA = (deps: string[], definitor: () => any) => void;
type DefineOverloadB = (name: string, deps: string[], definitor: () => any) => void;

type DefineWithExtensions = (DefineOverloadA | DefineOverloadB) & {
	launch?: (mod: string, fn: string, then?: (error: Error | null, entryPointExecutionResult: any) => void) => void;
	errorHandler?: (e: Error, action?: string) => void;
	amdRequire?: (name: string | string[], onOk: (...moduleData: any) => void, onError: (error: Error) => void) => void;
	commonjsRequire?: (name: string) => any;
	preferCommonjs?: boolean;
	insertScopeValue?: (name: string, value: any) => any;
	e?: (meta: ModuleMetaRuntime | null, code: string) => any; // eval
}

let define = (() => {
	let defMap = {} as {[moduleName: string]: ModuleMetaRuntime};
	let renames = {} as {[renaming: string]: string};

	function handleError(e: Error, action?: string): never {
		if(define.errorHandler){
			define.errorHandler(e, action);
		} else {
			console.error("Error" + (action? " " + action: "") + ": " + (e.stack || e.message || e));
		}
		throw e;
	}
	
	function hasEs5(): boolean {
		if(!Object.defineProperty)
			return false;
		let x = {} as any, y = 5;
		Object.defineProperty(x, "a", {
			get: () => y,
			set: v => y = v
		});
		if(x.a !== 5)
			return false;
		x.a = 10;
		return x.a === 10;
	}

	if(!hasEs5()){
		handleError(new Error("No ES5 support detected."));
	}

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
				return define.commonjsRequire(name)
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
					return define.amdRequire(externalNameArr, function(externalResults){
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

	function requireExternal(names: string[], onOk: (moduleVals: Iterable<any>) => void, onError: (error: Error) => void){
		if(define.preferCommonjs){
			try {
				onOk(names.map(name => define.commonjsRequire(name)))
			} catch(e){
				onError(e);
			}
		} else {
			define.amdRequire(names, function(){ onOk(arguments) }, onError);	
		}
	}

	function discoverExternalModules(moduleName: string, result: string[] = [], visited: {[k: string]: true} = {}): string[] {
		if(moduleName in renames){
			moduleName = renames[moduleName];
		}
		if(moduleName in visited || moduleName === "require" || moduleName === "exports")
			return;
		visited[moduleName] = true;
		if(moduleName in defMap){
			defMap[moduleName].dependencies.forEach(depName => discoverExternalModules(depName, result, visited));
		} else {
			result.push(moduleName);
		}
		return result;
	}

	function preloadExternalModules(entryPoint: string, onDone: () => void){
		let externalNames = discoverExternalModules(entryPoint);
		requireExternal(externalNames, externalValues => {
			externalNames.forEach((name, i) => {
				defMap[externalNames[i]] = {
					definitor: () => { throw new Error("Impossible to invoke definition of external module \"" + name + "\".") },
					product: externalValues[i],
					dependencies: [],
					exports: [],
					name: name,
					external: true,
					arbitraryType: true // мы ничего не знаем про экспортируемое значение, поэтому так
				}
			});
			onDone();
		}, handleError);
	}

	let nextMeta: ModuleMetaRuntime | null = null;
	let define: DefineWithExtensions = (name: string | null, deps: string[], definitor: () => any) => {
		if(Array.isArray(name)){
			definitor = deps as unknown as (() => void);
			deps = name as string[];
			name = null;
		}

		let meta = nextMeta;
		if(!meta){
			handleError(new Error("No module metadata is passed before calling define()."));
			return;
		}

		if(name){
			renames[name] = meta.name;
		}

		meta.dependencies = deps;
		meta.definitor = definitor;

		defMap[meta.name] = meta;
	}

	let currentlyDefiningProductMap = {} as {[name: string]: true};
	let currentlyDefiningProductSeq = [] as string[];

	function getProduct(name: string): any {
		if(name in renames){
			name = renames[name];
		}
		let meta = defMap[name];
		if(!meta.product){
			if(name in currentlyDefiningProductMap){
				let str = name;
				for(let i = currentlyDefiningProductSeq.length - 1; i >= 0; i--){
					let n = currentlyDefiningProductSeq[i];
					str += " <- " + currentlyDefiningProductSeq[i];
					if(n === name)
						break;
				}
				throw new Error("Unresolvable circular dependency detected: " + str);
			}
			currentlyDefiningProductMap[name] = true;
			currentlyDefiningProductSeq.push(name);

			try {
				let product: any;
				let deps = meta.dependencies.map(name => {
					if(name === "exports"){
						return product = {};
					} else if(name === "require"){
						return requireAny;
					}
					if(name in renames){
						name = renames[name];
					}
					let depMeta = defMap[name];
					if(!depMeta){
						throw new Error("Failed to get module \"" + name + "\": no definition is known and no preloaded external module is present.");
					}
					return depMeta.arbitraryType? getProduct(name): getProxy(depMeta);
				});
				let returnProduct = meta.definitor.apply(null, deps);
				if(meta.arbitraryType){
					product = returnProduct;
				}
				meta.product = product;
			} finally {
				delete currentlyDefiningProductMap[name];
				currentlyDefiningProductSeq.pop();
			}
		}
		return meta.product;
	}

	function defineProxyProp(meta: ModuleMetaRuntime, name: string): any {
		let proxy = meta.proxy as Object;
		if(proxy.hasOwnProperty(name)){
			console.warn("Module " + meta.name + " has more than one exported member " + name + ". Will pick first defined one.");
			return;
		}
		Object.defineProperty(proxy, name, {
			get: () => getProduct(meta.name)[name],
			set: v => getProduct(meta.name)[name] = v,
			enumerable: true
		});
	}

	function getAllExportNames(meta: ModuleMetaRuntime, result: string[][] = [], noDefault: boolean = false): string[][]{
		if(meta.exports){
			if(noDefault){
				result.push(meta.exports.filter(_ => _ !== "default"));
			} else {
				result.push(meta.exports);
			}
		}
		if(meta.exportRefs){
			meta.exportRefs.forEach(ref => {
				getAllExportNames(defMap[ref], result, true);
			});
		}
		return result;
	}

	function getProxy(meta: ModuleMetaRuntime){
		if(!meta.proxy){
			meta.proxy = {};
			let allExportNames = getAllExportNames(meta)
			allExportNames.forEach(arr => {
				arr.forEach(name => {
					defineProxyProp(meta, name);
				});
			});
		}
		return meta.proxy;
	}

	define.e = (meta, str) => {
		nextMeta = meta;
		eval(str + '\n//# sourceURL=' + meta.name);
		nextMeta = null;
	}

	/*
	// функция для прокидывания внутрь скоупа define.e каких-либо глобальных значений
	define.insertScopeValue = (name, value) => {
		var glob = define.e("this")
		glob.__tsbundlerInsertionValue = value;
		define.e("var define=__tsbundlerInsertionValue")
		delete glob.__tsbundlerInsertionValue;
	}

	define.insertScopeValue("define", define);
	*/

	define.launch = (mod, fn, then) => {
		preloadExternalModules(mod, () => {
			let mainProduct = getProduct(mod);
			
			// инициализируем все модули в бандле, ради сайд-эффектов
			Object.keys(defMap).forEach(name => {
				let meta = defMap[name];
				if(!meta.product){
					getProduct(name);
				}
			});

			let res: any = null;
			let err: Error | null = null;
			try {
				res = mainProduct[fn].call(null);
			} catch(e){
				err = e;
			}
			if(then){
				then(err, res);
			}
		});
	}

	return define;
})();