(function (defs, params) {
    function handleError(e, action) {
        if (params.errorHandler) {
            params.errorHandler(e, action);
        }
        else {
            console.error("Error" + (action ? " " + action : "") + ": " + (e.stack || e.message || e));
        }
        throw e;
    }
    // разбираем полученный массив определений
    var renames = {};
    var defMap = {};
    for (var i = 0; i < defs.length; i++) {
        var v = defs[i];
        var m = typeof (v[2]) !== "string" ? v[2] : undefined;
        var def = m ? m : {};
        def.name = v[0];
        def.code = v[v.length - 1];
        if (m && m.altName) {
            renames[m.altName] = def.name;
        }
        def.dependencies = Array.isArray(v[1]) ? v[1] : [];
        defMap[def.name] = def;
    }
    var amdRequire = params.amdRequire || require;
    var commondjsRequire = params.commonjsRequire || require;
    /** функция, которую будут дергать в качестве require изнутри модулей */
    function requireAny(names, onOk, onError) {
        if (Array.isArray(names) && !onOk) {
            throw new Error("Passed array of module names to require (" + names.join(", ") + "), but provided no callback! This is inconsistent.");
        }
        if (!onOk) {
            var name_1 = names;
            if (name_1 in defMap) {
                return getProduct(name_1);
            }
            else {
                return commondjsRequire(name_1);
            }
        }
        else {
            try {
                var nameArr_1 = Array.isArray(names) ? names : [names];
                var results_1 = {};
                var externalNameArr_1 = nameArr_1.filter(function (name) {
                    if (name in defMap) {
                        results_1[name] = getProduct(name);
                        return false;
                    }
                    return true;
                });
                var callOk_1 = function () {
                    var resultsArr = [];
                    for (var i = 0; i < nameArr_1.length; i++) {
                        resultsArr.push(results_1[nameArr_1[i]]);
                    }
                    return onOk.apply(null, resultsArr);
                };
                if (externalNameArr_1.length === 0) {
                    return callOk_1();
                }
                else {
                    return amdRequire(externalNameArr_1, function (externalResults) {
                        for (var i = 0; i < externalNameArr_1.length; i++) {
                            results_1[externalNameArr_1[i]] = externalResults[i];
                        }
                        callOk_1();
                    }, onError);
                }
            }
            catch (e) {
                if (onError) {
                    onError(e);
                }
                else {
                    throw e;
                }
            }
        }
    }
    var currentlyDefiningProductMap = {};
    var currentlyDefiningProductSeq = [];
    var products = {};
    function throwCircularDependencyError(name) {
        var str = name;
        for (var i = currentlyDefiningProductSeq.length - 1; i >= 0; i--) {
            var n = currentlyDefiningProductSeq[i];
            str += " <- " + currentlyDefiningProductSeq[i];
            if (n === name)
                break;
        }
        throw new Error("Unresolvable circular dependency detected: " + str);
    }
    function getProduct(name) {
        name = renames[name] || name;
        var meta = defMap[name];
        if (!(name in products)) {
            if (name in currentlyDefiningProductMap) {
                throwCircularDependencyError(name);
            }
            currentlyDefiningProductMap[name] = true;
            currentlyDefiningProductSeq.push(name);
            try {
                var product = {};
                var deps_1 = [product, requireAny];
                meta.dependencies.forEach(function (name) {
                    if (name in renames) {
                        name = renames[name];
                    }
                    var depMeta = defMap[name];
                    if (!depMeta) {
                        throw new Error("Failed to get module \"" + name + "\": no definition is known and no preloaded external module is present.");
                    }
                    deps_1.push(depMeta.arbitraryType || !depMeta.exports ? getProduct(name) : getProxy(depMeta));
                });
                var defFunc = eval("(" + meta.code + ")\n//# sourceURL=" + meta.name);
                var returnProduct = defFunc.apply(null, deps_1);
                if (meta.arbitraryType) {
                    product = returnProduct;
                }
                products[name] = product;
            }
            finally {
                delete currentlyDefiningProductMap[name];
                currentlyDefiningProductSeq.pop();
            }
        }
        return products[name];
    }
    var proxies = {};
    function getProxy(def) {
        if (!(def.name in proxies)) {
            var proxy_1 = {};
            getAllExportNames(def).forEach(function (arr) {
                arr.forEach(function (name) {
                    defineProxyProp(def, proxy_1, name);
                });
            });
            proxies[def.name] = proxy_1;
        }
        return proxies[def.name];
    }
    function getAllExportNames(meta, result, noDefault) {
        if (result === void 0) { result = []; }
        if (noDefault === void 0) { noDefault = false; }
        if (meta.exports) {
            if (noDefault) {
                result.push(meta.exports.filter(function (_) { return _ !== "default"; }));
            }
            else {
                result.push(meta.exports);
            }
        }
        if (meta.exportRefs) {
            meta.exportRefs.forEach(function (ref) {
                getAllExportNames(defMap[ref], result, true);
            });
        }
        return result;
    }
    function defineProxyProp(meta, proxy, name) {
        if (proxy.hasOwnProperty(name)) {
            console.warn("Module " + meta.name + " has more than one exported member " + name + ". Will pick first defined one.");
            return;
        }
        Object.defineProperty(proxy, name, {
            get: function () { return getProduct(meta.name)[name]; },
            set: function (v) { return getProduct(meta.name)[name] = v; },
            enumerable: true
        });
    }
    function discoverExternalModules(moduleName, result, visited) {
        if (result === void 0) { result = []; }
        if (visited === void 0) { visited = {}; }
        if (moduleName in renames) {
            moduleName = renames[moduleName];
        }
        if (!(moduleName in visited)) {
            visited[moduleName] = true;
            if (moduleName in defMap) {
                defMap[moduleName].dependencies.forEach(function (depName) { return discoverExternalModules(depName, result, visited); });
            }
            else {
                result.push(moduleName);
            }
        }
        return result;
    }
    function requireExternal(names, onOk, onError) {
        if (params.preferCommonjs) {
            try {
                onOk(names.map(function (name) { return commondjsRequire(name); }));
            }
            catch (e) {
                onError(e);
            }
        }
        else {
            amdRequire(names, function () { onOk(arguments); }, onError);
        }
    }
    function preloadExternalModules(entryPoint, onDone) {
        var externalNames = discoverExternalModules(entryPoint);
        requireExternal(externalNames, function (externalValues) {
            externalNames.forEach(function (name, i) {
                products[name] = externalValues[i];
            });
            onDone();
        }, handleError);
    }
    function start() {
        preloadExternalModules(params.entryPoint.module, function () {
            var mainProduct = getProduct(params.entryPoint.module);
            // инициализируем все модули в бандле, ради сайд-эффектов
            Object.keys(defMap).forEach(function (name) {
                if (!(name in products)) {
                    getProduct(name);
                }
            });
            var res = null;
            var err = null;
            try {
                res = mainProduct[params.entryPoint.function].call(null);
            }
            catch (e) {
                err = e;
            }
            if (params.afterEntryPointExecuted) {
                params.afterEntryPointExecuted(err, res);
            }
        });
    }
    start();
});
