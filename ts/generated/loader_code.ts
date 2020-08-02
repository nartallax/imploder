export const loaderCode = `
var define = (function () {
    var defMap = {};
    var renames = {};
    function handleError(e, action) {
        if (define.errorHandler) {
            define.errorHandler(e, action);
        }
        else {
            console.error("Error" + (action ? " " + action : "") + ": " + (e.stack || e.message || e));
        }
        throw e;
    }
    function hasEs5() {
        if (!Object.defineProperty)
            return false;
        var x = {}, y = 5;
        Object.defineProperty(x, "a", {
            get: function () { return y; },
            set: function (v) { return y = v; }
        });
        if (x.a !== 5)
            return false;
        x.a = 10;
        return x.a === 10;
    }
    if (!hasEs5()) {
        handleError(new Error("No ES5 support detected."));
    }
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
                return define.commonjsRequire(name_1);
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
                    return define.amdRequire(externalNameArr_1, function (externalResults) {
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
    function requireExternal(names, onOk, onError) {
        if (define.preferCommonjs) {
            try {
                onOk(names.map(function (name) { return define.commonjsRequire(name); }));
            }
            catch (e) {
                onError(e);
            }
        }
        else {
            define.amdRequire(names, function () { onOk(arguments); }, onError);
        }
    }
    function discoverExternalModules(moduleName, result, visited) {
        if (result === void 0) { result = []; }
        if (visited === void 0) { visited = {}; }
        if (moduleName in renames) {
            moduleName = renames[moduleName];
        }
        if (moduleName in visited || moduleName === "require" || moduleName === "exports")
            return;
        visited[moduleName] = true;
        if (moduleName in defMap) {
            defMap[moduleName].dependencies.forEach(function (depName) { return discoverExternalModules(depName, result, visited); });
        }
        else {
            result.push(moduleName);
        }
        return result;
    }
    function preloadExternalModules(entryPoint, onDone) {
        var externalNames = discoverExternalModules(entryPoint);
        requireExternal(externalNames, function (externalValues) {
            externalNames.forEach(function (name, i) {
                defMap[externalNames[i]] = {
                    definitor: function () { throw new Error("Impossible to invoke definition of external module \\"" + name + "\\"."); },
                    product: externalValues[i],
                    dependencies: [],
                    exports: [],
                    name: name,
                    external: true,
                    arbitraryType: true // мы ничего не знаем про экспортируемое значение, поэтому так
                };
            });
            onDone();
        }, handleError);
    }
    var nextMeta = null;
    var define = function (name, deps, definitor) {
        if (Array.isArray(name)) {
            definitor = deps;
            deps = name;
            name = null;
        }
        var meta = nextMeta;
        if (!meta) {
            handleError(new Error("No module metadata is passed before calling define()."));
            return;
        }
        if (name) {
            renames[name] = meta.name;
        }
        meta.dependencies = deps;
        meta.definitor = definitor;
        defMap[meta.name] = meta;
    };
    var currentlyDefiningProductMap = {};
    var currentlyDefiningProductSeq = [];
    function getProduct(name) {
        if (name in renames) {
            name = renames[name];
        }
        var meta = defMap[name];
        if (!meta.product) {
            if (name in currentlyDefiningProductMap) {
                var str = name;
                for (var i = currentlyDefiningProductSeq.length - 1; i >= 0; i--) {
                    var n = currentlyDefiningProductSeq[i];
                    str += " <- " + currentlyDefiningProductSeq[i];
                    if (n === name)
                        break;
                }
                throw new Error("Unresolvable circular dependency detected: " + str);
            }
            currentlyDefiningProductMap[name] = true;
            currentlyDefiningProductSeq.push(name);
            try {
                var product_1;
                var deps = meta.dependencies.map(function (name) {
                    if (name === "exports") {
                        return product_1 = {};
                    }
                    else if (name === "require") {
                        return requireAny;
                    }
                    if (name in renames) {
                        name = renames[name];
                    }
                    var depMeta = defMap[name];
                    if (!depMeta) {
                        throw new Error("Failed to get module \\"" + name + "\\": no definition is known and no preloaded external module is present.");
                    }
                    return depMeta.arbitraryType ? getProduct(name) : getProxy(depMeta);
                });
                var returnProduct = meta.definitor.apply(null, deps);
                if (meta.arbitraryType) {
                    product_1 = returnProduct;
                }
                meta.product = product_1;
            }
            finally {
                delete currentlyDefiningProductMap[name];
                currentlyDefiningProductSeq.pop();
            }
        }
        return meta.product;
    }
    function defineProxyProp(meta, name) {
        var proxy = meta.proxy;
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
    function getProxy(meta) {
        if (!meta.proxy) {
            meta.proxy = {};
            var allExportNames = getAllExportNames(meta);
            allExportNames.forEach(function (arr) {
                arr.forEach(function (name) {
                    defineProxyProp(meta, name);
                });
            });
        }
        return meta.proxy;
    }
    define.e = function (meta, str) {
        nextMeta = meta;
        eval(str + '\\n//# sourceURL=' + meta.name);
        nextMeta = null;
    };
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
    define.launch = function (mod, fn, then) {
        preloadExternalModules(mod, function () {
            var mainProduct = getProduct(mod);
            // инициализируем все модули в бандле, ради сайд-эффектов
            Object.keys(defMap).forEach(function (name) {
                var meta = defMap[name];
                if (!meta.product) {
                    getProduct(name);
                }
            });
            var res = null;
            var err = null;
            try {
                res = mainProduct[fn].call(null);
            }
            catch (e) {
                err = e;
            }
            if (then) {
                then(err, res);
            }
        });
    };
    return define;
})();
`;
