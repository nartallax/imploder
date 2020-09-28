let define = (() => {
	setTimeout(async () => {
		try {
			let mainPackageName = "bundler_main";
			let mainFunctionName = "tsBundlerMain";
			let pkg = resolve(mainPackageName);
			await Promise.resolve(pkg[mainFunctionName].call(null));
		} catch(e){
			console.error("Bundler failed:");
			console.error(e.stack);
			process.exit(1);
		}
	}, 1);

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
	
	return function define(name, deps, def){
		defMap[name] = {deps, def};
	}
})();
"use strict";
define("afs", ["require", "exports", "fs", "path"], function (require, exports, fs, path) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.unlinkRecursive = exports.readdir = exports.rmdir = exports.unlink = exports.fileExists = exports.stat = exports.writeTextFile = exports.readTextFile = void 0;
    function wrap(call) {
        return new Promise(async (ok, bad) => {
            try {
                await Promise.resolve(call((err, res) => {
                    if (err) {
                        bad(err);
                    }
                    else {
                        ok(res);
                    }
                }));
            }
            catch (e) {
                bad(e);
            }
        });
    }
    function readTextFile(path, encoding = "utf8") {
        return wrap(cb => fs.readFile(path, encoding, cb));
    }
    exports.readTextFile = readTextFile;
    function writeTextFile(path, content, encoding = "utf8") {
        return wrap(cb => fs.writeFile(path, content, encoding, err => cb(err)));
    }
    exports.writeTextFile = writeTextFile;
    function stat(path) {
        return wrap(cb => fs.stat(path, cb));
    }
    exports.stat = stat;
    async function fileExists(path) {
        return wrap(cb => fs.stat(path, err => cb(null, !err)));
    }
    exports.fileExists = fileExists;
    function unlink(path) {
        return wrap(cb => fs.unlink(path, err => cb(err)));
    }
    exports.unlink = unlink;
    function rmdir(path) {
        return wrap(cb => fs.rmdir(path, err => cb(err)));
    }
    exports.rmdir = rmdir;
    function readdir(path) {
        return wrap(cb => fs.readdir(path, cb));
    }
    exports.readdir = readdir;
    function unlinkRecursive(fsEntryPath) {
        return wrap(async (cb) => {
            let st = await stat(fsEntryPath);
            if (st.isDirectory()) {
                let list = await readdir(fsEntryPath);
                await Promise.all(list.map(name => {
                    let fullPath = path.join(fsEntryPath, name);
                    return unlinkRecursive(fullPath);
                }));
                await rmdir(fsEntryPath);
            }
            else {
                await unlink(fsEntryPath);
            }
            cb(null);
        });
    }
    exports.unlinkRecursive = unlinkRecursive;
});
define("log", ["require", "exports", "typescript"], function (require, exports, tsc) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.logErrorAndExit = exports.logDebug = exports.logInfo = exports.logWarn = exports.logError = exports.setLogVerbosityLevel = void 0;
    let logVerbosityLevel = 0;
    function twoDig(x) { return (x > 9 ? "" : "0") + x; }
    function threeDig(x) { return x > 99 ? "" + x : "0" + twoDig(x); }
    function timeStr() {
        let d = new Date();
        return `${d.getFullYear()}.${twoDig(d.getMonth() + 1)}.${twoDig(d.getDate())} ${twoDig(d.getHours())}:${twoDig(d.getMinutes())}:${twoDig(d.getSeconds())}:${threeDig(d.getMilliseconds())}`;
    }
    function setLogVerbosityLevel(level) {
        logVerbosityLevel = level;
    }
    exports.setLogVerbosityLevel = setLogVerbosityLevel;
    function logWithLevel(verbosityLevel, str) {
        if (verbosityLevel <= logVerbosityLevel)
            tsc.sys.write(timeStr() + "\t" + str + "\n");
    }
    function logError(str) { return logWithLevel(-2, str); }
    exports.logError = logError;
    function logWarn(str) { return logWithLevel(-1, str); }
    exports.logWarn = logWarn;
    function logInfo(str) { return logWithLevel(0, str); }
    exports.logInfo = logInfo;
    function logDebug(str) { return logWithLevel(1, str); }
    exports.logDebug = logDebug;
    function logErrorAndExit(str) {
        logError(str);
        process.exit(1);
    }
    exports.logErrorAndExit = logErrorAndExit;
});
define("cli", ["require", "exports", "log"], function (require, exports, log_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CLI = void 0;
    class CLI {
        constructor(params) {
            this.params = params;
        }
        static get processArgvWithoutExecutables() {
            return process.argv.slice(2);
        }
        static defaultHelpPrinter(lines) {
            lines.forEach(line => console.error(line));
            return process.exit(1);
        }
        static printErrorAndExit(error) {
            log_1.logError(error.message);
            return process.exit(1);
        }
        static str(params) {
            return {
                default: params.default,
                keys: Array.isArray(params.keys) ? params.keys : [params.keys],
                allowedValues: params.allowedValues,
                definition: params.definition,
                type: "string"
            };
        }
        static bool(params) {
            return {
                default: false,
                keys: Array.isArray(params.keys) ? params.keys : [params.keys],
                definition: params.definition,
                type: "bool"
            };
        }
        static help(params) {
            return {
                default: false,
                keys: Array.isArray(params.keys) ? params.keys : [params.keys],
                definition: params.definition,
                isHelp: true,
                type: "bool"
            };
        }
        static double(params) {
            return {
                default: params.default,
                keys: Array.isArray(params.keys) ? params.keys : [params.keys],
                allowedValues: params.allowedValues,
                definition: params.definition,
                type: "double"
            };
        }
        static int(params) {
            return {
                default: params.default,
                keys: Array.isArray(params.keys) ? params.keys : [params.keys],
                allowedValues: params.allowedValues,
                definition: params.definition,
                type: "int"
            };
        }
        fail(msg) {
            return (this.params.onError || CLI.printErrorAndExit)(new Error(msg));
        }
        printHelp() {
            let helpLines = this.params.helpHeader ? [this.params.helpHeader] : [];
            let argNames = Object.keys(this.params.definition);
            let keyPart = (argName) => {
                let def = this.params.definition[argName];
                return def.keys.join(", ") + " (" + def.type + ")";
            };
            let maxKeyLength = argNames.map(argName => keyPart(argName).length).reduce((a, b) => Math.max(a, b), 0);
            argNames.forEach(argName => {
                let def = this.params.definition[argName];
                let line = keyPart(argName);
                while (line.length < maxKeyLength)
                    line += " ";
                if (def.definition) {
                    line += ": " + def.definition;
                }
                if (def.allowedValues) {
                    line += " Allowed values: " + def.allowedValues.join(", ") + ".";
                }
                helpLines.push(line);
            });
            (this.params.showHelp || CLI.defaultHelpPrinter)(helpLines);
        }
        buildKeysMap() {
            let result = new Map();
            Object.keys(this.params.definition).forEach(argName => {
                let keys = this.params.definition[argName].keys;
                if (keys.length === 0) {
                    this.fail("CLI argument \"" + argName + "\" has no keys with which it could be passed.");
                }
                keys.forEach(key => {
                    if (result.has(key)) {
                        this.fail("CLI argument key \"" + key + "\" is bound to more than one argument: \"" + argName + "\", \"" + result.get(key) + "\".");
                    }
                    result.set(key, argName);
                });
            });
            return result;
        }
        parseArgs(values = CLI.processArgvWithoutExecutables) {
            let result = this.extract(values);
            let haveHelp = false;
            let abstentMandatories = [];
            Object.keys(this.params.definition).forEach(argName => {
                let def = this.params.definition[argName];
                if (def.isHelp && !!result[argName]) {
                    haveHelp = true;
                }
                if (argName in result) {
                    if (def.allowedValues) {
                        let s = new Set(def.allowedValues);
                        if (!s.has(result[argName])) {
                            this.fail("Value of CLI argument \"" + argName + "\" is not in allowed values set: it's \"" + result[argName] + ", while allowed values are " + def.allowedValues.map(x => "\"" + x + "\"").join(", "));
                        }
                    }
                    return;
                }
                if (def.default !== undefined) {
                    result[argName] = def.default;
                }
                else {
                    abstentMandatories.push(argName);
                }
            });
            if (haveHelp) {
                this.printHelp();
            }
            if (abstentMandatories.length > 0) {
                this.fail("Some mandatory CLI arguments are absent: " + abstentMandatories.map(x => "\"" + x + "\"").join(", "));
            }
            return result;
        }
        extract(values) {
            let knownArguments = new Set();
            let keyToArgNameMap = this.buildKeysMap();
            let result = {};
            for (let i = 0; i < values.length; i++) {
                let v = values[i];
                if (!keyToArgNameMap.has(v)) {
                    this.fail("Unknown CLI argument key: \"" + v + "\".");
                }
                let argName = keyToArgNameMap.get(v);
                if (knownArguments.has(argName)) {
                    this.fail("CLI argument \"" + argName + "\" passed more than once, last time with key \"" + v + "\".");
                }
                knownArguments.add(argName);
                let actualValue;
                let def = this.params.definition[argName];
                switch (def.type) {
                    case "bool":
                        actualValue = true;
                        break;
                    case "string":
                    case "int":
                    case "double":
                        if (i === values.length - 1) {
                            this.fail("Expected to have some value after CLI key \"" + v + "\".");
                        }
                        i++;
                        actualValue = values[i];
                        if (def.type === "int" || def.type === "double") {
                            let num = parseFloat(actualValue);
                            if (!Number.isFinite(num)) {
                                this.fail("Expected to have number after CLI key \"" + v + "\", got \"" + actualValue + "\" instead.");
                            }
                            if (def.type === "int" && (num % 1) !== 0) {
                                this.fail("Expected to have integer number after CLI key \"" + v + "\", got \"" + actualValue + "\" instead (it's fractional).");
                            }
                            actualValue = num;
                        }
                }
                result[argName] = actualValue;
            }
            return result;
        }
    }
    exports.CLI = CLI;
});
define("config", ["require", "exports", "cli", "path"], function (require, exports, cli_1, path) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getConfig = void 0;
    function parseCliArgs() {
        let res = new cli_1.CLI({
            helpHeader: "A helper tool to assemble Javascript bundles out of Typescript projects.",
            definition: {
                configPath: cli_1.CLI.str({ keys: "--config", definition: "Path to tsconfig.json.", default: "" }),
                fancy: cli_1.CLI.bool({ keys: "--fancy", definition: "Output beatiful debuggable code (instead of compressed mess that complies to older ECMA version)." }),
                devmode: cli_1.CLI.bool({ keys: "--devmode", definition: "Enables compilation-after-any-source-change. Also sets --fancy to true." }),
                useStdio: cli_1.CLI.bool({ keys: "--use-stdio", definition: "Enables communication with outside world through STDIO. Only usable in devmode." }),
                httpPort: cli_1.CLI.int({ keys: "--port", definition: "Enables tool to listen on specified port. Any HTTP request to this port will trigger bundling, and response to this request will be bundled code. Devmode only.", default: 0 }),
                verbose: cli_1.CLI.bool({ keys: ["-v", "--verbose"], definition: "Adds some more bundler-debug-related trash in stderr." }),
                help: cli_1.CLI.help({ keys: ["-h", "--h", "-help", "--help"], definition: "Shows list of commands." }),
                test: cli_1.CLI.bool({ keys: ["--test"], definition: "Run autotests." }),
                testSingle: cli_1.CLI.str({ keys: ["--test-single"], definition: "Run one single autotest.", default: "" })
            }
        }).parseArgs();
        if (res.configPath) {
            res.configPath = path.resolve(res.configPath);
        }
        return res;
    }
    let config = null;
    function getConfig() {
        if (!config) {
            config = parseCliArgs();
        }
        return config;
    }
    exports.getConfig = getConfig;
});
define("utils", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
});
define("path_utils", ["require", "exports", "path", "typescript"], function (require, exports, path, tsc) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.typescriptFileExists = exports.stripTsExt = exports.isTsExt = exports.isPathNested = exports.joinModulePath = exports.getRelativeModulePath = exports.normalizeModulePath = exports.isModulePathRelative = void 0;
    const tsFileExtensions = new Set([".ts", ".tsx"]);
    function isModulePathRelative(modulePath) {
        return modulePath.startsWith("./") || modulePath.startsWith("../");
    }
    exports.isModulePathRelative = isModulePathRelative;
    function normalizeModulePath(p) {
        return p.replace(/\\/g, "/");
    }
    exports.normalizeModulePath = normalizeModulePath;
    function getRelativeModulePath(startAt, relModulePath) {
        return normalizeModulePath(path.relative(startAt, relModulePath));
    }
    exports.getRelativeModulePath = getRelativeModulePath;
    function joinModulePath(a, b) {
        return normalizeModulePath(path.join(a, b));
    }
    exports.joinModulePath = joinModulePath;
    function isPathNested(a, b) {
        if (a === b) {
            return false;
        }
        let starts = a.startsWith(b);
        if (!starts && b.startsWith(a)) {
            starts = true;
            let c = b;
            b = a;
            a = c;
        }
        if (!starts)
            return false;
        let partsA = a.split(/[\\\/]/);
        let partsB = b.split(/[\\\/]/);
        return partsA[partsB.length - 1] === partsB[partsB.length - 1];
    }
    exports.isPathNested = isPathNested;
    function isTsExt(path) {
        let extMatch = path.match(/\.[^\.]+$/);
        if (!extMatch)
            return false;
        let ext = extMatch[0].toLowerCase();
        return tsFileExtensions.has(ext);
    }
    exports.isTsExt = isTsExt;
    function stripTsExt(path) {
        return isTsExt(path) ? path.replace(/\.[^\.]+$/, "") : path;
    }
    exports.stripTsExt = stripTsExt;
    function typescriptFileExists(extensionlessAbsolutePath) {
        let allFilesInDir = tsc.sys.readDirectory(path.dirname(extensionlessAbsolutePath));
        return !!allFilesInDir.find(fileInDir => {
            fileInDir = normalizeModulePath(fileInDir.toLowerCase());
            return fileInDir.startsWith(extensionlessAbsolutePath.toLowerCase())
                && tsFileExtensions.has(fileInDir.substr(extensionlessAbsolutePath.length));
        });
    }
    exports.typescriptFileExists = typescriptFileExists;
});
define("transformer/tsconfig_paths_parser", ["require", "exports", "typescript", "path", "log", "path_utils"], function (require, exports, tsc, path, log_2, path_utils_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getModulePathMatcher = void 0;
    function getModulePathMatcher(compilerOptions, tsconfigPath) {
        let absBaseUrl = compilerOptions.baseUrl || ".";
        if (!isPathAbsolute(absBaseUrl)) {
            absBaseUrl = path.join(path.dirname(tsconfigPath), absBaseUrl);
        }
        let mappings = parsePathsFromTsconfig(absBaseUrl, compilerOptions.paths || {});
        return modulePath => tryApplyMappings(mappings, modulePath, absBaseUrl);
    }
    exports.getModulePathMatcher = getModulePathMatcher;
    function parsePathsFromTsconfig(absBaseUrl, paths) {
        let fixedMappings = {};
        let wildcardMappings = {};
        for (let moduleNamePart in paths) {
            let pathParts = paths[moduleNamePart];
            if (moduleNamePart.endsWith("*")) {
                let nonWildPaths = pathParts.filter(_ => !_.endsWith("*"));
                if (nonWildPaths.length > 0) {
                    log_2.logWarn("Value of paths compiler option is strange: as key \""
                        + moduleNamePart + "\" is wildcard, value(s) \""
                        + nonWildPaths.join("\", \"") + "\" are not. Will treat them as wildcarded.");
                }
                let cleanAbsPaths = pathParts.map(_ => path.join(absBaseUrl, _.replace(/\*$/, "")));
                let cleanNamePart = moduleNamePart.replace(/\*$/, "");
                wildcardMappings[cleanNamePart] = cleanAbsPaths;
            }
            else {
                let wildPaths = pathParts.filter(_ => _.endsWith("*"));
                if (wildPaths.length > 0) {
                    log_2.logWarn("Value of paths compiler option is strange: as key \""
                        + moduleNamePart + "\" is not wildcard, value(s) \""
                        + wildPaths.join("\", \"") + "\" are. I don't know what do you expect from this; will ignore this value(s).");
                }
                let existingValues = pathParts
                    .filter(_ => !_.endsWith("*"))
                    .map(_ => path.join(absBaseUrl, _))
                    .filter(_ => tsc.sys.fileExists(_))
                    .map(_ => path_utils_1.stripTsExt(_));
                if (existingValues.length < 1) {
                    log_2.logWarn("Found none of targets of path \"" + moduleNamePart + "\": tried \"" + existingValues.join("\", \"") + "\".");
                }
                else {
                    fixedMappings[moduleNamePart] = existingValues[0];
                }
            }
        }
        return {
            fixed: fixedMappings,
            wildcard: wildcardMappings
        };
    }
    function isPathAbsolute(p) {
        if (!p)
            return false;
        let isUnixAbsolutePath = p[0] === "/";
        let isWindowsAbsolutePath = /^[A-Z]:\//.test(p);
        return isUnixAbsolutePath || isWindowsAbsolutePath;
    }
    function tryApplyMappings(mappings, modulePath, absBaseUrl) {
        let fixedPath = mappings.fixed[modulePath];
        if (fixedPath) {
            return fixedPath;
        }
        let matchedPrefixes = [];
        let matchedFiles = [];
        function tryUsePrefix(modulePrefix, substitutes) {
            if (modulePath.startsWith(modulePrefix)) {
                matchedPrefixes.push(modulePrefix);
                let pathPostfix = modulePath.substr(modulePrefix.length);
                for (let pathPrefix of substitutes) {
                    let fullModulePath = path_utils_1.joinModulePath(pathPrefix, pathPostfix);
                    if (path_utils_1.typescriptFileExists(fullModulePath)) {
                        matchedFiles.push(fullModulePath);
                    }
                }
            }
        }
        for (let modulePrefix in mappings.wildcard) {
            tryUsePrefix(modulePrefix, mappings.wildcard[modulePrefix]);
        }
        if (matchedPrefixes.length === 0) {
            tryUsePrefix("", [path.join(absBaseUrl, "./")]);
        }
        if (matchedFiles.length === 1) {
            return matchedFiles[0];
        }
        if (matchedPrefixes.length > 0) {
            if (matchedFiles.length < 1) {
                log_2.logWarn("For module dependency path \""
                    + modulePath + "\" there some wildcard path roots that are matched (\""
                    + matchedPrefixes.join("\", \"") + "\"), but no file is found within these roots.");
            }
            else {
                log_2.logWarn("For module dependency path \""
                    + modulePath + "\" there some wildcard path roots that are matched (\""
                    + matchedPrefixes.join("\", \"") + "\", and multiple files are found within these roots: \""
                    + matchedFiles.join("\", \"") + "\". For sake of consistency, will pick neither of them.");
            }
        }
        return null;
    }
});
define("module_path_resolver", ["require", "exports", "path", "transformer/tsconfig_paths_parser", "path_utils", "log"], function (require, exports, path, tsconfig_paths_parser_1, path_utils_2, log_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ModulePathResolver = void 0;
    class ModulePathResolver {
        constructor(tsconfigPath, compilerOpts) {
            this.pathMatcher = tsconfig_paths_parser_1.getModulePathMatcher(compilerOpts, tsconfigPath);
            this.moduleRoot = path.resolve(path.dirname(tsconfigPath), compilerOpts.rootDir || ".");
            this.rootDirWrangler = new RootDirWrangler(this.moduleRoot, compilerOpts.rootDirs);
        }
        getRootdirRelativePath(moduleDesignator, sourceFile, isKnownPath = false) {
            if (path_utils_2.isModulePathRelative(moduleDesignator) || isKnownPath) {
                return "/" + this.rootDirWrangler.getRelativePath(sourceFile, moduleDesignator);
            }
            else {
                void mappedModulePathToRelative;
                let abs = this.pathMatcher(moduleDesignator);
                return abs ? this.getAbsoluteModulePath(abs) : moduleDesignator;
            }
        }
        resolveModuleDesignator(moduleDesignator, sourceFile, isKnownPath = false) {
            let resultModulePath = this.getRootdirRelativePath(moduleDesignator, sourceFile, isKnownPath);
            log_3.logDebug("Resolved module path " + moduleDesignator + " to " + resultModulePath + " (is known path = " + isKnownPath + ")");
            return resultModulePath || moduleDesignator;
        }
        getAbsoluteModulePath(absPath) {
            return "/" + path_utils_2.getRelativeModulePath(this.moduleRoot, absPath);
        }
    }
    exports.ModulePathResolver = ModulePathResolver;
    class RootDirWrangler {
        constructor(rootDir, rootDirs) {
            this.rootDir = rootDir;
            this.rootDirs = rootDirs;
        }
        getRelativePath(sourceFile, modulePath) {
            if (!this.rootDirs) {
                return path_utils_2.getRelativeModulePath(this.rootDir, path.resolve(path.dirname(sourceFile), modulePath));
            }
            let sourceRootDir = this.rootDirs.find(_ => path_utils_2.isPathNested(_, sourceFile));
            if (!sourceRootDir) {
                log_3.logError("Source file \"" + sourceFile + "\" is not found in any of rootDirs. Don't know how to resolve relative dependencies of it.");
                return null;
            }
            let fakeAbsPath = path.resolve(path.dirname(sourceFile), modulePath);
            let targetRootRelPath = path_utils_2.getRelativeModulePath(sourceRootDir, fakeAbsPath);
            let targetRootDirs = this.rootDirs.filter(_ => path_utils_2.typescriptFileExists(path_utils_2.joinModulePath(_, targetRootRelPath)));
            if (targetRootDirs.length < 1) {
                log_3.logError("Relative dependency \"" + modulePath + "\" (referenced from \"" + sourceFile + "\") is not found in any of rootDirs.");
                return null;
            }
            if (targetRootDirs.length > 1) {
                log_3.logError("Relative dependency \"" + modulePath + "\" (referenced from \"" + sourceFile + "\") is not found in more than one of rootDirs: \"" + targetRootDirs.join("\", \"") + "\". Could not decide; won't pick any.");
                return null;
            }
            let targetRootDir = targetRootDirs[0];
            return path_utils_2.getRelativeModulePath(this.rootDir, path.join(targetRootDir, targetRootRelPath));
        }
    }
    function mappedModulePathToRelative(sourcePath, absModulePath, matcher) {
        let resolvedPath = matcher(absModulePath);
        if (!resolvedPath) {
            return null;
        }
        let result = path_utils_2.getRelativeModulePath(sourcePath, resolvedPath);
        if (!path_utils_2.isModulePathRelative(result)) {
            result = "./" + result;
        }
        return result;
    }
});
define("module_meta_storage", ["require", "exports", "log"], function (require, exports, log_4) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ModuleMetadataStorage = void 0;
    class ModuleMetadataStorage {
        constructor() {
            this.data = {};
        }
        set(name, data) {
            log_4.logDebug("Got info on " + name + " module: " + JSON.stringify(data));
            this.data[name] = data;
        }
        get(name) {
            let res = this.data[name];
            if (!res)
                throw new Error("Module not found: " + name);
            return res;
        }
        deleteModule(name) {
            delete this.data[name];
        }
        has(name) {
            return name in this.data;
        }
        getNames() {
            return Object.keys(this.data);
        }
    }
    exports.ModuleMetadataStorage = ModuleMetadataStorage;
});
define("transformer/abstract_transformer", ["require", "exports", "typescript", "path_utils"], function (require, exports, tsc, path_utils_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.AbstractTransformer = void 0;
    class AbstractTransformer {
        constructor(context, resolver) {
            this.context = context;
            this.resolver = resolver;
        }
        transformBundle(node) {
            return node;
        }
        transformSourceFile(fileNode) {
            return fileNode;
        }
        transformVisitRecursive(node, mapper, currentDepth = 0) {
            let mapped = mapper(node, currentDepth);
            if (!mapped.recurse) {
                return mapped.result;
            }
            else {
                if (Array.isArray(mapped.result)) {
                    let arr = mapped.result;
                    for (let i = 0; i < arr.length; i++) {
                        arr[i] = tsc.visitEachChild(arr[i], child => this.transformVisitRecursive(child, mapper, currentDepth + 1), this.context);
                    }
                    return arr;
                }
                else {
                    return tsc.visitEachChild(mapped.result, child => this.transformVisitRecursive(child, mapper, currentDepth + 1), this.context);
                }
            }
        }
        visitRecursive(node, visitor, shouldFallThrough = null, currentDepth = 0) {
            let stopped = false;
            node.forEachChild(child => {
                if (stopped || visitor(child, currentDepth) === false) {
                    stopped = true;
                    return;
                }
                if (shouldFallThrough && shouldFallThrough(child)) {
                    if (this.visitRecursive(child, visitor, shouldFallThrough, currentDepth + 1) === false) {
                        stopped = true;
                        return;
                    }
                }
            });
            return !stopped;
        }
        traverseDumpFileAst(fileNode) {
            let prefix = fileNode.fileName;
            if (prefix.length > 30) {
                prefix = "..." + prefix.substr(prefix.length - 30);
            }
            this.visitRecursive(fileNode, (node, depth) => {
                console.log(prefix + new Array(depth + 2).join("    ") + tsc.SyntaxKind[node.kind]);
            });
        }
        moduleNameByNode(fileNode) {
            return path_utils_3.stripTsExt(this.resolver.getAbsoluteModulePath(fileNode.fileName));
        }
    }
    exports.AbstractTransformer = AbstractTransformer;
});
define("transformer/before_js_transformer", ["require", "exports", "typescript", "log", "transformer/abstract_transformer"], function (require, exports, tsc, log_5, abstract_transformer_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.BeforeJsBundlerTransformer = void 0;
    class BeforeJsBundlerTransformer extends abstract_transformer_1.AbstractTransformer {
        constructor(context, metaStorage, resolver) {
            super(context, resolver);
            this.metaStorage = metaStorage;
        }
        transformSourceFile(fileNode) {
            let moduleName = this.moduleNameByNode(fileNode);
            log_5.logDebug("Visiting " + this.resolver.getAbsoluteModulePath(fileNode.fileName) + " as module " + moduleName);
            let meta = {
                dependencies: [],
                exportModuleReferences: [],
                exports: [],
                hasOmniousExport: false,
                altName: null,
                jsCode: null,
                hasImportOrExport: false
            };
            if (fileNode.referencedFiles.length > 0) {
                log_5.logWarn("File " + moduleName + " references some other files. They will not be included in bundle.");
            }
            if (fileNode.moduleName) {
                meta.altName = fileNode.moduleName;
            }
            this.exploreSpecialExports(meta, fileNode);
            this.metaStorage.set(moduleName, meta);
            return fileNode;
        }
        exploreSpecialExports(moduleMeta, fileNode) {
            let children = fileNode.getChildren();
            if (children.length === 2 && children[0].kind === tsc.SyntaxKind.SyntaxList && children[1].kind === tsc.SyntaxKind.EndOfFileToken) {
                children = children[0].getChildren();
            }
            for (let node of children) {
                if (tsc.isExportDeclaration(node)) {
                    if (!node.exportClause) {
                        if (!node.moduleSpecifier || !tsc.isStringLiteral(node.moduleSpecifier)) {
                            log_5.logErrorAndExit("Unexpected: \"export * from\" construction has no module specifier (or is not string literal).");
                        }
                        moduleMeta.exportModuleReferences.push(node.moduleSpecifier.text);
                    }
                    else {
                        let exportClause = node.exportClause;
                        if (tsc.isNamedExports(exportClause)) {
                            for (let exportElement of exportClause.elements) {
                                moduleMeta.exports.push(exportElement.name.text);
                            }
                        }
                        else {
                            throw new Error("Export declaration is not consists of named elements.");
                        }
                    }
                }
                else if (tsc.isExportAssignment(node)) {
                    if (!node.isExportEquals) {
                        moduleMeta.exports.push("default");
                    }
                    else {
                        moduleMeta.hasOmniousExport = true;
                    }
                }
            }
            moduleMeta.exportModuleReferences = [...new Set(moduleMeta.exportModuleReferences.map(x => this.resolver.resolveModuleDesignator(x, fileNode.fileName)))];
        }
    }
    exports.BeforeJsBundlerTransformer = BeforeJsBundlerTransformer;
});
define("transformer/after_js_transformer", ["require", "exports", "transformer/abstract_transformer", "typescript", "path_utils", "log"], function (require, exports, abstract_transformer_2, tsc, path_utils_4, log_6) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.AfterJsBundlerTransformer = void 0;
    class AfterJsBundlerTransformer extends abstract_transformer_2.AbstractTransformer {
        constructor(context, metaStorage, resolver) {
            super(context, resolver);
            this.metaStorage = metaStorage;
        }
        transformSourceFile(fileNode) {
            let moduleName = this.moduleNameByNode(fileNode);
            let moduleMeta = this.metaStorage.get(moduleName);
            let definingFunction = null;
            this.visitRecursive(fileNode, node => {
                if (!tsc.isCallExpression(node) || !tsc.isIdentifier(node.expression) || node.expression.text !== "define" && !!definingFunction) {
                    return;
                }
                definingFunction = this.processDefineCall(moduleMeta, node, fileNode);
                return false;
            }, node => {
                return !tsc.isFunctionExpression(node);
            });
            if (!definingFunction) {
                if (moduleMeta.hasImportOrExport) {
                    throw new Error("Transformed code of module " + moduleName + " does not contain any define() invocations");
                }
                else {
                    return fileNode;
                }
            }
            this.setImportExportFlag(moduleMeta, fileNode, moduleName);
            let result = tsc.getMutableClone(fileNode);
            result.statements = tsc.createNodeArray([definingFunction]);
            return result;
        }
        setImportExportFlag(moduleMeta, fileNode, moduleName) {
            moduleMeta.hasImportOrExport = moduleMeta.hasImportOrExport
                || moduleMeta.exports.length > 0
                || moduleMeta.hasOmniousExport
                || moduleMeta.dependencies.length > 0
                || moduleMeta.exportModuleReferences.length > 0;
            if (moduleMeta.hasImportOrExport) {
                fileNode.amdDependencies.forEach(dep => {
                    let path = this.resolver.resolveModuleDesignator(path_utils_4.stripTsExt(dep.path), fileNode.fileName, true);
                    moduleMeta.dependencies.push(path);
                });
            }
            else {
                if (fileNode.amdDependencies.length > 0) {
                    log_6.logWarn("Source file " + moduleName + " has <amd-dependency>, but is not a module (does not exports or imports anything). Dependency information will be lost.");
                }
                if (moduleMeta.altName) {
                    log_6.logWarn("Source file " + moduleName + " has <amd-module>, but is not a module (does not exports or imports anything). Value of module name will be lost.");
                }
            }
        }
        processDefineCall(moduleMeta, defineCallNode, fileNode) {
            let depArrNode = defineCallNode.arguments[defineCallNode.arguments.length - 2];
            if (!tsc.isArrayLiteralExpression(depArrNode)) {
                throw new Error("Second-from-end argument of define() is not array literal.");
            }
            let rawDependencies = depArrNode.elements.map(el => {
                if (!tsc.isStringLiteral(el)) {
                    throw new Error("Second-from-end argument of define() is not string literal array.");
                }
                return el.text;
            }).filter(x => x !== "exports" && x !== "require");
            moduleMeta.dependencies = rawDependencies.map(x => this.resolver.resolveModuleDesignator(x, fileNode.fileName));
            let defFuncArg = defineCallNode.arguments[defineCallNode.arguments.length - 1];
            if (!tsc.isFunctionExpression(defFuncArg)) {
                throw new Error("First-from-end argument of define() is not function expression.");
            }
            let moduleBodyStatements = defFuncArg.body.statements;
            let startWith = 0;
            let firstMeaninfulStatementReached = false;
            for (let i = 0; i < moduleBodyStatements.length; i++) {
                let statement = moduleBodyStatements[i];
                if (!tsc.isExpressionStatement(statement)) {
                    firstMeaninfulStatementReached = true;
                    continue;
                }
                let expr = statement.expression;
                if (!firstMeaninfulStatementReached) {
                    if (tsc.isStringLiteral(expr) && expr.text === "use strict") {
                        startWith = i + 1;
                        continue;
                    }
                    if (this.isExportAssignment(expr)) {
                        let exportName = this.getExportAssignmentName(expr);
                        if (exportName === "__esModule") {
                            startWith = i + 1;
                            continue;
                        }
                        else {
                            moduleMeta.exports.push(exportName);
                            if (tsc.isVoidExpression(expr.right)) {
                                startWith = i + 1;
                                continue;
                            }
                        }
                    }
                    firstMeaninfulStatementReached = true;
                }
                if (this.isExportAssignment(expr)) {
                    moduleMeta.exports.push(this.getExportAssignmentName(expr));
                }
            }
            moduleMeta.exports = [...new Set(moduleMeta.exports)];
            let resultBodyStatements = moduleBodyStatements.slice(startWith);
            let result = tsc.getMutableClone(defFuncArg);
            let resultBody = result.body = tsc.getMutableClone(result.body);
            resultBody.statements = tsc.createNodeArray(resultBodyStatements);
            let params = [...result.parameters];
            params = params.filter(x => !tsc.isIdentifier(x.name) || (x.name.text !== "exports" && x.name.text !== "require"));
            params = [
                tsc.createParameter(undefined, undefined, undefined, "exports"),
                tsc.createParameter(undefined, undefined, undefined, "require"),
                ...params
            ];
            result.parameters = tsc.createNodeArray(params);
            return result;
        }
        isExportAssignment(node) {
            if (tsc.isBinaryExpression(node)
                && tsc.isPropertyAccessExpression(node.left)
                && tsc.isIdentifierOrPrivateIdentifier(node.left.expression)
                && node.left.expression.text === "exports") {
                return true;
            }
            return false;
        }
        getExportAssignmentName(node) {
            return node.left.name.text;
        }
    }
    exports.AfterJsBundlerTransformer = AfterJsBundlerTransformer;
});
define("compiler", ["require", "exports", "typescript", "path", "log", "transformer/before_js_transformer", "path_utils", "module_meta_storage", "bundler", "afs", "module_path_resolver", "transformer/after_js_transformer"], function (require, exports, tsc, path, log_7, before_js_transformer_1, path_utils_5, module_meta_storage_1, bundler_1, afs_1, module_path_resolver_1, after_js_transformer_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.processTypescriptDiagnostics = exports.processTypescriptDiagnosticEntry = exports.Compiler = void 0;
    class Compiler {
        constructor(config, transformers = []) {
            this._watch = null;
            this._program = null;
            this._inclusionConfig = null;
            this._mergedConfig = null;
            this.config = config;
            this.modulePathResolver = new module_path_resolver_1.ModulePathResolver(this.tsconfigPath, this.mergedConfig.options);
            this.transformers = [
                context => new before_js_transformer_1.BeforeJsBundlerTransformer(context, this.metaStorage, this.modulePathResolver),
                ...transformers
            ];
            this.bundler = new bundler_1.Bundler(this);
            this.metaStorage = new module_meta_storage_1.ModuleMetadataStorage();
        }
        get program() {
            if (this._program) {
                return this._program;
            }
            if (this._watch) {
                return this._watch.getProgram().getProgram();
            }
            throw new Error("Compiler not started in any of available modes.");
        }
        startWatch() {
            let watchHost = tsc.createWatchCompilerHost(this.config.configPath, this.mergedConfig.options, tsc.sys, undefined, processTypescriptDiagnosticEntry);
            this._watch = tsc.createWatchProgram(watchHost);
            processTypescriptDiagnostics(tsc.getPreEmitDiagnostics(this.program));
        }
        async runSingle() {
            this._program = tsc.createProgram(this.mergedConfig);
            processTypescriptDiagnostics(tsc.getPreEmitDiagnostics(this.program));
            let emitResult = this.program.emit(undefined, undefined, undefined, undefined, {
                before: this.transformers,
                after: [
                    context => new after_js_transformer_1.AfterJsBundlerTransformer(context, this.metaStorage, this.modulePathResolver)
                ]
            });
            processTypescriptDiagnostics(emitResult.diagnostics);
            let bundle = await this.bundler.produceBundle();
            await afs_1.writeTextFile(this.inclusionConfig.outFile, bundle);
        }
        loadTsconfig() {
            let [rawConfig, inclusion] = this.getTsconfigRaw();
            this.validateFixConfig(rawConfig, inclusion);
            this._mergedConfig = {
                ...rawConfig,
                rootNames: [path.resolve(path.dirname(this.tsconfigPath), inclusion.entryModule)]
            };
            this._inclusionConfig = inclusion;
        }
        get mergedConfig() {
            if (!this._mergedConfig) {
                this.loadTsconfig();
            }
            return this._mergedConfig;
        }
        get inclusionConfig() {
            if (!this._inclusionConfig) {
                this.loadTsconfig();
            }
            return this._inclusionConfig;
        }
        validateFixConfig(config, inclusion) {
            if (config.fileNames.length < 1) {
                log_7.logErrorAndExit("No file names are passed from tsconfig.json, therefore there is no root package. Nothing will be compiled.");
            }
            inclusion.outFile = path.resolve(path.dirname(this.config.configPath), inclusion.outFile);
            if (config.options.module === undefined) {
                config.options.module = tsc.ModuleKind.AMD;
            }
            else if (config.options.module !== tsc.ModuleKind.AMD) {
                log_7.logErrorAndExit("This tool is only able to work with AMD modules. Adjust compiler options in tsconfig.json.");
            }
            if (config.options.outFile) {
                log_7.logErrorAndExit("This tool is not able to work with outFile passed in compilerOptions. Remove it (and/or move to bundlerConfig).");
            }
            if (config.options.incremental) {
                log_7.logErrorAndExit("This tool is not able to work with incremental passed in compilerOptions.");
            }
            if (!config.options.outDir) {
                log_7.logErrorAndExit("You must explicitly pass outDir within compilerOptions.");
            }
            if (!config.options.rootDir) {
                config.options.rootDir = path.dirname(this.config.configPath);
            }
            if (config.options.rootDirs) {
                let dirs = config.options.rootDirs;
                let haveNestedDirs = false;
                for (let i = 0; i < dirs.length; i++) {
                    for (let j = i + 1; j < dirs.length; j++) {
                        if (path_utils_5.isPathNested(dirs[i], dirs[j])) {
                            log_7.logError("Values of rootDirs must not be nested within one another, but there are \"" + dirs[i] + "\" and \"" + dirs[j] + "\" which are nested.");
                            haveNestedDirs = true;
                        }
                    }
                }
                if (haveNestedDirs) {
                    process.exit(1);
                }
            }
            config.options.importHelpers = true;
            config.options.noEmitHelpers = true;
            if (!config.options.moduleResolution) {
                config.options.moduleResolution = tsc.ModuleResolutionKind.NodeJs;
            }
            else if (config.options.moduleResolution !== tsc.ModuleResolutionKind.NodeJs) {
                log_7.logErrorAndExit("Module resolution types other than node are not supported.");
            }
        }
        getTsconfigRaw() {
            let parseConfigHost = {
                useCaseSensitiveFileNames: false,
                readDirectory: tsc.sys.readDirectory,
                fileExists: tsc.sys.fileExists,
                readFile: tsc.sys.readFile,
            };
            let fileContentStr = tsc.sys.readFile(this.config.configPath);
            if (!fileContentStr) {
                log_7.logErrorAndExit("Failed to read " + this.config.configPath);
            }
            let fileContentParsed = tsc.parseJsonText(this.config.configPath, fileContentStr);
            let rawJson = JSON.parse(fileContentStr);
            let projectRoot = path.dirname(this.config.configPath);
            let result = tsc.parseJsonSourceFileConfigFileContent(fileContentParsed, parseConfigHost, projectRoot);
            processTypescriptDiagnostics(result.errors);
            return [result, rawJson.bundlerConfig];
        }
        get outDir() { return this.mergedConfig.options.outDir; }
        get entryModule() {
            let absPath = path.resolve(path.dirname(this.tsconfigPath), this.inclusionConfig.entryModule);
            let name = path_utils_5.stripTsExt(this.modulePathResolver.getAbsoluteModulePath(absPath));
            return name;
        }
        get entryFunction() { return this.inclusionConfig.entryFunction; }
        get errorHandlerName() { return this.inclusionConfig.errorHandlerName || null; }
        get amdRequireName() { return this.inclusionConfig.amdRequireName || "require"; }
        get commonjsRequireName() { return this.inclusionConfig.commonjsRequireName || "require"; }
        get preferCommonjs() { return this.inclusionConfig.preferCommonjs === false ? false : true; }
        get noLoaderCode() { return !!this.inclusionConfig.noLoaderCode; }
        get tsconfigPath() { return this.config.configPath; }
    }
    exports.Compiler = Compiler;
    function processTypescriptDiagnosticEntry(d) {
        let msg = [];
        if (d.file) {
            let origin = d.file.fileName;
            if (typeof (d.start) === "number") {
                let { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
                origin += ` (${line + 1}:${character + 1}`;
            }
            msg.push(origin);
        }
        msg.push(tsc.DiagnosticCategory[d.category] + ":");
        msg.push(tsc.flattenDiagnosticMessageText(d.messageText, '\n'));
        msg.push(d.code.toString());
        let msgString = msg.map(_ => _ && _.trim()).filter(_ => !!_).join(" ");
        if (d.category == tsc.DiagnosticCategory.Error) {
            log_7.logError(msgString);
            return true;
        }
        else if (d.category === tsc.DiagnosticCategory.Warning) {
            log_7.logWarn(msgString);
        }
        else {
            log_7.logInfo(msgString);
        }
        return false;
    }
    exports.processTypescriptDiagnosticEntry = processTypescriptDiagnosticEntry;
    function processTypescriptDiagnostics(diagnostics) {
        let haveErrors = false;
        for (let d of diagnostics || []) {
            haveErrors = haveErrors || processTypescriptDiagnosticEntry(d);
        }
        if (haveErrors) {
            process.exit(1);
        }
    }
    exports.processTypescriptDiagnostics = processTypescriptDiagnostics;
});
define("seq_set", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.SeqSet = void 0;
    class SeqSet {
        constructor() {
            this.seq = [];
            this.set = new Set();
        }
        push(v) {
            if (this.set.has(v)) {
                throw new Error("Could not add repeated value \"" + v + "\" to SeqSet.");
            }
            this.set.add(v);
            this.seq.push(v);
        }
        has(v) {
            return this.set.has(v);
        }
        pop() {
            let res = this.seq.pop();
            if (res === undefined) {
                throw new Error("SeqSet underflow.");
            }
            this.set.delete(res);
            return res;
        }
    }
    exports.SeqSet = SeqSet;
});
define("module_orderer", ["require", "exports", "seq_set"], function (require, exports, seq_set_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ModuleOrderer = void 0;
    class ModuleOrderer {
        constructor(storage) {
            this.storage = storage;
        }
        getModuleOrder(entryPointModule) {
            let circularDependentModules = new Set();
            let [modules, absentModules] = this.getSortedModules(entryPointModule, circularDependentModules);
            modules.forEach(name => this.detectRecursiveRefExport(name));
            return { modules, absentModules, circularDependentModules };
        }
        unwindNameStack(nameStack, name) {
            let referenceCircle = [name];
            let vals = nameStack.seq;
            for (let i = vals.length - 1; i >= 0; i--) {
                let v = vals[i];
                referenceCircle.push(v);
                if (v === name) {
                    break;
                }
            }
            return referenceCircle;
        }
        detectRecursiveRefExport(entryPoint) {
            let nameStack = new seq_set_1.SeqSet();
            let visit = (name) => {
                if (nameStack.has(name)) {
                    throw new Error("Recursive \"export *\" detected: " + this.unwindNameStack(nameStack, name).join(" <- "));
                }
                nameStack.push(name);
                if (this.storage.has(name)) {
                    this.storage.get(name).exportModuleReferences.forEach(dep => visit(dep));
                }
                nameStack.pop();
            };
            visit(entryPoint);
        }
        getSortedModules(entryPoint, circularDependencyModules) {
            let nameStack = new seq_set_1.SeqSet();
            let absentModules = new Set();
            let result = [];
            let visit = (name) => {
                if (nameStack.has(name)) {
                    this.unwindNameStack(nameStack, name).forEach(x => circularDependencyModules.add(x));
                    return;
                }
                if (!this.storage.has(name)) {
                    absentModules.add(name);
                }
                else {
                    nameStack.push(name);
                    result.push(name);
                    this.storage.get(name).dependencies.forEach(dep => visit(dep));
                    nameStack.pop();
                }
            };
            visit(entryPoint);
            return [
                result.sort((a, b) => a < b ? -1 : a > b ? 1 : 0),
                [...absentModules]
            ];
        }
    }
    exports.ModuleOrderer = ModuleOrderer;
});
define("generated/loader_code", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loaderCode = void 0;
    exports.loaderCode = `
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
                        throw new Error("Failed to get module \\"" + name + "\\": no definition is known and no preloaded external module is present.");
                    }
                    deps_1.push(depMeta.arbitraryType || !depMeta.exports ? getProduct(name) : getProxy(depMeta));
                });
                var defFunc = eval("(" + meta.code + ")\\n//# sourceURL=" + meta.name);
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
`;
});
define("loader/loader_types", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
});
define("bundler", ["require", "exports", "module_orderer", "generated/loader_code", "log", "path", "afs"], function (require, exports, module_orderer_1, loader_code_1, log_8, path, afs_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Bundler = void 0;
    class Bundler {
        constructor(compiler) {
            this.compiler = compiler;
        }
        async produceBundle() {
            let result = [];
            if (!this.compiler.noLoaderCode) {
                result.push(this.getPrefixCode());
            }
            await this.loadAbsentModuleCode();
            let moduleOrder = new module_orderer_1.ModuleOrderer(this.compiler.metaStorage).getModuleOrder(this.compiler.entryModule);
            log_8.logDebug("Bundle related modules: " + JSON.stringify(moduleOrder));
            let defArrArr = this.buildModuleDefinitionArrayArray(moduleOrder.modules, moduleOrder.circularDependentModules);
            result.push(JSON.stringify(defArrArr));
            if (!this.compiler.noLoaderCode) {
                result.push(this.getPostfixCode());
            }
            return result.join("\n");
        }
        buildModuleDefinitionArrayArray(modules, circularDependentModules) {
            return modules.map(name => {
                let meta = this.compiler.metaStorage.get(name);
                let code = meta.jsCode;
                if (!code) {
                    throw new Error("Code for module " + name + " is not loaded at bundling time.");
                }
                let haveModuleRefs = meta.exportModuleReferences.length > 0;
                let needExports = meta.exports.length > 0 && circularDependentModules.has(name);
                if (needExports || !!meta.altName || meta.hasOmniousExport || haveModuleRefs) {
                    let short = {};
                    if (haveModuleRefs) {
                        short.exportRefs = meta.exportModuleReferences;
                    }
                    if (needExports) {
                        short.exports = meta.exports;
                    }
                    if (meta.hasOmniousExport) {
                        short.arbitraryType = true;
                    }
                    if (meta.altName) {
                        short.altName = meta.altName;
                    }
                    return [name, meta.dependencies, short, code];
                }
                else {
                    return meta.dependencies.length > 0 ? [name, meta.dependencies, code] : [name, code];
                }
            });
        }
        getPrefixCode() {
            return loader_code_1.loaderCode.replace(/;?[\n\s]*$/, "") + "(\n";
        }
        getPostfixCode(thenCode) {
            let params = {
                entryPoint: {
                    module: this.compiler.entryModule,
                    function: this.compiler.entryFunction
                }
            };
            if (this.compiler.errorHandlerName) {
                params.errorHandler = this.compiler.errorHandlerName;
            }
            if (this.compiler.amdRequireName !== "require") {
                params.amdRequire = this.compiler.amdRequireName;
            }
            if (this.compiler.commonjsRequireName !== "require") {
                params.commonjsRequire = this.compiler.commonjsRequireName;
            }
            if (this.compiler.preferCommonjs) {
                params.preferCommonjs = true;
            }
            let paramStr = JSON.stringify(params);
            if (thenCode) {
                paramStr = paramStr.substr(0, paramStr.length - 1) + `,${JSON.stringify("afterEntryPointExecuted")}:${thenCode}}`;
            }
            return ",\n" + paramStr + ");";
        }
        async loadAbsentModuleCode() {
            let storage = this.compiler.metaStorage;
            let proms = [];
            let names = storage.getNames();
            names.forEach(moduleName => {
                let mod = storage.get(moduleName);
                if (!mod.jsCode) {
                    let modulePath = path.join(this.compiler.outDir, moduleName + ".js");
                    proms.push((async () => {
                        let code = await afs_2.readTextFile(modulePath);
                        mod.jsCode = code;
                    })());
                }
            });
            if (proms.length > 0) {
                await Promise.all(proms);
            }
        }
    }
    exports.Bundler = Bundler;
});
define("generated/test_list_str", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.testListStr = void 0;
    exports.testListStr = `
cyclic_exportall
dynamic_imports_misconfigured
exports
namespace
paths
proj_synth
resolvable_cyclic_reference
rootdirs
type_only_imports
unresolvable_cyclic_reference
`;
});
define("test", ["require", "exports", "path", "fs", "compiler", "log", "generated/test_list_str", "afs"], function (require, exports, path, fs, compiler_1, log_9, test_list_str_1, afs_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.runSingleTest = exports.runAllTests = void 0;
    class TestProject {
        constructor(name) {
            this.name = name;
            this.compileErrorText = this.fileContentOrNull("./compile_error.txt");
            this.runtimeErrorText = this.fileContentOrNull("./runtime_error.txt");
            this.bundleText = this.fileContentOrNull("./bundle.js");
            this.stdoutText = this.fileContentOrNull("./stdout.txt");
            this._producedBundleText = null;
            this._compiler = null;
        }
        get producedBundleText() {
            if (!this._producedBundleText) {
                this._producedBundleText = this.fileContentOrNull("./js/bundle.js");
                if (this._producedBundleText === null) {
                    throw new Error("Expected test project \"" + this.name + "\" to produce bundle code, but it is not.");
                }
            }
            return this._producedBundleText;
        }
        get compiler() {
            if (!this._compiler) {
                this._compiler = new compiler_1.Compiler({
                    configPath: path.join(TestProject.testsRoot, this.name, "./tsconfig.json")
                });
            }
            return this._compiler;
        }
        fileContentOrNull(subpath) {
            let p = path.join(TestProject.testsRoot, this.name, subpath);
            try {
                fs.statSync(p);
            }
            catch (e) {
                return null;
            }
            return fs.readFileSync(p, "utf8").trim();
        }
        outputError(error) {
            log_9.logError("Test " + this.name + " failed: " + error);
            return false;
        }
        checkError(err, errType, errString) {
            if (errString) {
                if (!err) {
                    return this.outputError("expected " + errType + " error to be thrown, but it was not.");
                }
                let trimmedMessage = err.message.trim();
                if (trimmedMessage !== errString) {
                    return this.outputError("expected " + errType + " error text to be \"" + errString + "\", but it's \"" + trimmedMessage + "\".");
                }
            }
            else if (err) {
                return this.outputError((err.stack || err.message || err) + "");
            }
            return true;
        }
        checkBundle() {
            if (this.producedBundleText !== this.bundleText) {
                return this.outputError("bundles are different.");
            }
            return true;
        }
        async runBundle() {
            let outerConsole = console;
            let stdout = [];
            await (() => {
                return new Promise((ok, bad) => {
                    let console = {
                        ...outerConsole,
                        log: (...values) => {
                            let str = values.join(" ");
                            stdout.push(str);
                        }
                    };
                    let nop = () => { };
                    let mainThen = async (err, result) => {
                        if (err) {
                            bad(err);
                        }
                        else {
                            try {
                                await Promise.resolve(result);
                                ok();
                            }
                            catch (e) {
                                bad(e);
                            }
                        }
                    };
                    void console;
                    void nop;
                    void mainThen;
                    let allCode = [
                        this.compiler.bundler.getPrefixCode(),
                        this.producedBundleText,
                        this.compiler.bundler.getPostfixCode("mainThen")
                    ].join("\n");
                    try {
                        eval(allCode);
                    }
                    catch (e) {
                        bad(e);
                    }
                });
            })();
            return stdout.join("\n");
        }
        async checkStdout() {
            let stdout = await this.runBundle();
            if (stdout !== this.stdoutText) {
                return this.outputError("stdout text expected to be \"" + this.stdoutText + "\", but it's \"" + stdout + "\" instead.");
            }
            return true;
        }
        async rmOutDir() {
            let outDirPath = path.join(TestProject.testsRoot, this.name, "./js");
            if (await afs_3.fileExists(outDirPath)) {
                await afs_3.unlinkRecursive(outDirPath);
            }
        }
        async run() {
            log_9.logInfo("Running test for " + this.name);
            await this.rmOutDir();
            let err = null;
            try {
                await this.compiler.runSingle();
            }
            catch (e) {
                err = e;
            }
            if (!this.checkError(err, "compile-time", this.compileErrorText)) {
                return false;
            }
            if (err) {
                return true;
            }
            try {
                if (!(await this.checkStdout())) {
                    return false;
                }
            }
            catch (e) {
                err = e;
            }
            if (!this.checkError(err, "runtime", this.runtimeErrorText)) {
                return false;
            }
            if (err) {
                return true;
            }
            return this.checkBundle();
        }
    }
    TestProject.testsRoot = path.resolve(__dirname, "./test/");
    const knownTestNames = test_list_str_1.testListStr
        .split("\n")
        .map(_ => _.trim())
        .filter(_ => !!_)
        .filter(_ => _ !== "proj_synth");
    async function runAllTests() {
        log_9.logInfo("Running all tests.");
        let failCount = 0;
        for (let testName of knownTestNames) {
            let result = await new TestProject(testName).run();
            if (!result)
                failCount++;
        }
        if (failCount < 1) {
            log_9.logInfo("Done. Testing successful.");
            process.exit(0);
        }
        else {
            log_9.logInfo("Done. Testing failed (" + failCount + " / " + knownTestNames.length + " tests failed)");
            process.exit(1);
        }
    }
    exports.runAllTests = runAllTests;
    async function runSingleTest(name) {
        if (knownTestNames.indexOf(name) < 0) {
            log_9.logError("Test name \"" + name + "\" is not known.");
            process.exit(1);
        }
        let ok = await new TestProject(name).run();
        if (!ok) {
            log_9.logInfo("Done. Test failed.");
            await new Promise(ok => setTimeout(ok, 1000));
            process.exit(1);
        }
        else {
            log_9.logInfo("Done. Testing successful.");
            await new Promise(ok => setTimeout(ok, 1000));
            process.exit(0);
        }
    }
    exports.runSingleTest = runSingleTest;
});
define("bundler_main", ["require", "exports", "config", "test", "log", "compiler"], function (require, exports, config_1, test_1, log_10, compiler_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.tsBundlerMain = void 0;
    async function tsBundlerMain() {
        let config = config_1.getConfig();
        if (config.verbose) {
            log_10.setLogVerbosityLevel(1);
        }
        if (config.test) {
            await test_1.runAllTests();
            return;
        }
        if (config.testSingle) {
            await test_1.runSingleTest(config.testSingle);
            return;
        }
        if (!config.configPath) {
            log_10.logErrorAndExit("Path to tsconfig.json is not passed. Could not start bundler.");
        }
        let compiler = new compiler_2.Compiler(config);
        compiler.runSingle();
    }
    exports.tsBundlerMain = tsBundlerMain;
});
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
    let renames = {};
    let defMap = {};
    for (let i = 0; i < defs.length; i++) {
        let v = defs[i];
        let m = typeof (v[2]) !== "string" ? v[2] : undefined;
        let def = m ? m : {};
        def.name = v[0];
        def.code = v[v.length - 1];
        if (m && m.altName) {
            renames[m.altName] = def.name;
        }
        def.dependencies = Array.isArray(v[1]) ? v[1] : [];
        defMap[def.name] = def;
    }
    let amdRequire = params.amdRequire || require;
    let commondjsRequire = params.commonjsRequire || require;
    function requireAny(names, onOk, onError) {
        if (Array.isArray(names) && !onOk) {
            throw new Error("Passed array of module names to require (" + names.join(", ") + "), but provided no callback! This is inconsistent.");
        }
        if (!onOk) {
            let name = names;
            if (name in defMap) {
                return getProduct(name);
            }
            else {
                return commondjsRequire(name);
            }
        }
        else {
            try {
                let nameArr = Array.isArray(names) ? names : [names];
                let results = {};
                let externalNameArr = nameArr.filter(name => {
                    if (name in defMap) {
                        results[name] = getProduct(name);
                        return false;
                    }
                    return true;
                });
                let callOk = () => {
                    let resultsArr = [];
                    for (let i = 0; i < nameArr.length; i++) {
                        resultsArr.push(results[nameArr[i]]);
                    }
                    return onOk.apply(null, resultsArr);
                };
                if (externalNameArr.length === 0) {
                    return callOk();
                }
                else {
                    return amdRequire(externalNameArr, function (externalResults) {
                        for (let i = 0; i < externalNameArr.length; i++) {
                            results[externalNameArr[i]] = externalResults[i];
                        }
                        callOk();
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
    let currentlyDefiningProductMap = {};
    let currentlyDefiningProductSeq = [];
    let products = {};
    function throwCircularDependencyError(name) {
        let str = name;
        for (let i = currentlyDefiningProductSeq.length - 1; i >= 0; i--) {
            let n = currentlyDefiningProductSeq[i];
            str += " <- " + currentlyDefiningProductSeq[i];
            if (n === name)
                break;
        }
        throw new Error("Unresolvable circular dependency detected: " + str);
    }
    function getProduct(name) {
        name = renames[name] || name;
        let meta = defMap[name];
        if (!(name in products)) {
            if (name in currentlyDefiningProductMap) {
                throwCircularDependencyError(name);
            }
            currentlyDefiningProductMap[name] = true;
            currentlyDefiningProductSeq.push(name);
            try {
                let product = {};
                let deps = [product, requireAny];
                meta.dependencies.forEach(name => {
                    if (name in renames) {
                        name = renames[name];
                    }
                    let depMeta = defMap[name];
                    if (!depMeta) {
                        throw new Error("Failed to get module \"" + name + "\": no definition is known and no preloaded external module is present.");
                    }
                    deps.push(depMeta.arbitraryType || !depMeta.exports ? getProduct(name) : getProxy(depMeta));
                });
                let defFunc = eval("(" + meta.code + ")\n//# sourceURL=" + meta.name);
                let returnProduct = defFunc.apply(null, deps);
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
    let proxies = {};
    function getProxy(def) {
        if (!(def.name in proxies)) {
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
    function getAllExportNames(meta, result = [], noDefault = false) {
        if (meta.exports) {
            if (noDefault) {
                result.push(meta.exports.filter(_ => _ !== "default"));
            }
            else {
                result.push(meta.exports);
            }
        }
        if (meta.exportRefs) {
            meta.exportRefs.forEach(ref => {
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
            get: () => getProduct(meta.name)[name],
            set: v => getProduct(meta.name)[name] = v,
            enumerable: true
        });
    }
    function discoverExternalModules(moduleName, result = [], visited = {}) {
        if (moduleName in renames) {
            moduleName = renames[moduleName];
        }
        if (!(moduleName in visited)) {
            visited[moduleName] = true;
            if (moduleName in defMap) {
                defMap[moduleName].dependencies.forEach(depName => discoverExternalModules(depName, result, visited));
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
                onOk(names.map(name => commondjsRequire(name)));
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
        let externalNames = discoverExternalModules(entryPoint);
        requireExternal(externalNames, externalValues => {
            externalNames.forEach((name, i) => {
                products[name] = externalValues[i];
            });
            onDone();
        }, handleError);
    }
    function start() {
        preloadExternalModules(params.entryPoint.module, () => {
            let mainProduct = getProduct(params.entryPoint.module);
            Object.keys(defMap).forEach(name => {
                if (!(name in products)) {
                    getProduct(name);
                }
            });
            let res = null;
            let err = null;
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
