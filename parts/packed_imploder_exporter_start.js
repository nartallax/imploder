let define = (() => {
	let defMap = {};
	let products = {require: require};
	let currentlyResolvingModules = new Set();

	function resolve(name){
		if(name in products){
			return products[name];
		}

		if(currentlyResolvingModules.has(name))
			throw new Error("Could not run bundler: recursive dependency for " + name + " (through " + [...currentlyResolvingModules].join(", ") + ")");

		if(!(name in defMap)){
			return require(name);
		}

		currentlyResolvingModules.add(name);
		try {
			let exports = {};
			let deps = defMap[name].deps.map(depName => {
				if(depName === "exports")
					return exports;
				else
					return resolve(depName);
			});

			defMap[name].def.apply(null, deps);
			products[name] = exports;
			return exports;
		} finally {
			currentlyResolvingModules.delete(name);
		}
	}
	
	let result = function define(name, deps, def){
		defMap[name] = {deps, def};
	}

	result.imploderDefinitionCompleted = function(){
		try {
			let mainPackageName = "imploder";
			let pkg = resolve(mainPackageName);
			if(typeof(module) === "object" && module && typeof(module.exports) === "object" && module.exports){
				module.exports = pkg;
			} else {
				console.error("Imploder failed at launch: there is no module.exports!");
				process.exit(1);
			}
		} catch(e){
			console.error("Imploder failed at launch:");
			console.error(e.stack);
			process.exit(1);
		}
	}

	return result;
})();
