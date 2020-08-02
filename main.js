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
        return modulePath => tryApplyMappings(mappings, modulePath);
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
    function tryApplyMappings(mappings, modulePath) {
        let fixedPath = mappings.fixed[modulePath];
        if (fixedPath)
            return fixedPath;
        let matchedPrefixes = [];
        let matchedFiles = [];
        for (let modulePrefix in mappings.wildcard) {
            if (modulePath.startsWith(modulePrefix)) {
                matchedPrefixes.push(modulePrefix);
                let pathPostfix = modulePath.substr(modulePrefix.length);
                for (let pathPrefix of mappings.wildcard[modulePrefix]) {
                    let fullModulePath = path_utils_1.joinModulePath(pathPrefix, pathPostfix);
                    if (path_utils_1.typescriptFileExists(fullModulePath)) {
                        matchedFiles.push(fullModulePath);
                    }
                }
            }
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
define("transformer/module_path_resolver", ["require", "exports", "path", "transformer/tsconfig_paths_parser", "path_utils", "log"], function (require, exports, path, tsconfig_paths_parser_1, path_utils_2, log_3) {
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
define("transformer/transformer_utils", ["require", "exports", "typescript"], function (require, exports, tsc) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.visitNodeRecursive = void 0;
    function visitNodeRecursive(node, context, mapper, currentDepth = 0) {
        return tsc.visitEachChild(mapper(node, currentDepth), child => visitNodeRecursive(child, context, mapper, currentDepth + 1), context);
    }
    exports.visitNodeRecursive = visitNodeRecursive;
});
define("transformer/export_explorer", ["require", "exports", "typescript", "log"], function (require, exports, tsc, log_5) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.hasExportModifier = exports.processFileExports = void 0;
    function processFileExports(fileNode, moduleMeta) {
        let children = fileNode.getChildren();
        if (children.length === 2 && children[0].kind === tsc.SyntaxKind.SyntaxList && children[1].kind === tsc.SyntaxKind.EndOfFileToken) {
            children = children[0].getChildren();
        }
        for (let node of children) {
            if (tsc.isFunctionDeclaration(node) || tsc.isClassDeclaration(node)) {
                if (hasExportModifier(node)) {
                    if (!node.name) {
                        log_5.logErrorAndExit("Unexpected: exported node of type " + tsc.SyntaxKind[node.kind] + " have no name.");
                    }
                    if (hassDefaultModifier(node)) {
                        moduleMeta.exports.push("default");
                    }
                    else {
                        moduleMeta.exports.push(node.name.text);
                    }
                }
            }
            else if (node.kind === tsc.SyntaxKind.FirstStatement) {
                if (hasExportModifier(node)) {
                    for (let child of node.getChildren()) {
                        if (tsc.isVariableDeclarationList(child)) {
                            for (let decl of child.declarations) {
                                let name = decl.name;
                                if (name.kind !== tsc.SyntaxKind.Identifier) {
                                    log_5.logErrorAndExit("Unexpected: exported variable declaration name is not identifier.");
                                }
                                moduleMeta.exports.push(name.text);
                            }
                        }
                    }
                }
            }
            else if (tsc.isModuleDeclaration(node)) {
                if (hasExportModifier(node)) {
                    for (let child of node.getChildren()) {
                        if (tsc.isIdentifier(child)) {
                            moduleMeta.exports.push(child.text);
                            break;
                        }
                    }
                }
            }
            else if (tsc.isExportDeclaration(node)) {
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
    }
    exports.processFileExports = processFileExports;
    function hasExportModifier(node) {
        return !!node.modifiers && !!node.modifiers.find(_ => _.kind === tsc.SyntaxKind.ExportKeyword);
    }
    exports.hasExportModifier = hasExportModifier;
    function hassDefaultModifier(node) {
        return !!node.modifiers && !!node.modifiers.find(_ => _.kind === tsc.SyntaxKind.DefaultKeyword);
    }
});
define("transformer/bundler_transformer", ["require", "exports", "typescript", "log", "path_utils", "transformer/transformer_utils", "transformer/export_explorer"], function (require, exports, tsc, log_6, path_utils_3, transformer_utils_1, export_explorer_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.BundlerTransformer = void 0;
    class BundlerTransformer {
        constructor(context, metaStorage, resolver) {
            this.context = context;
            this.metaStorage = metaStorage;
            this.resolver = resolver;
        }
        transformBundle(node) {
            return node;
        }
        transformSourceFile(fileNode) {
            let moduleName = path_utils_3.stripTsExt(this.resolver.getAbsoluteModulePath(fileNode.fileName));
            log_6.logDebug("Visiting " + this.resolver.getAbsoluteModulePath(fileNode.fileName) + " as module " + moduleName);
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
                log_6.logWarn("File " + moduleName + " references some other files. They will not be included in bundle.");
            }
            if (fileNode.moduleName) {
                meta.altName = fileNode.moduleName;
            }
            let result = transformer_utils_1.visitNodeRecursive(fileNode, this.context, node => {
                let result;
                if (tsc.isImportEqualsDeclaration(node)) {
                    result = this.fixImportEqualsNode(fileNode, node);
                }
                else if (tsc.isImportDeclaration(node) || tsc.isExportDeclaration(node)) {
                    result = this.fixImportExportNode(fileNode, node);
                }
                else if (tsc.isCallExpression(node) && node.expression.kind === tsc.SyntaxKind.ImportKeyword) {
                    result = this.fixDynamicImportNode(fileNode, node);
                }
                else {
                    return node;
                }
                meta.hasImportOrExport = true;
                return result;
            });
            this.exploreExports(meta, fileNode);
            this.metaStorage.set(moduleName, meta);
            if (meta.hasImportOrExport) {
                fileNode.amdDependencies.forEach(dep => {
                    let path = this.fixModulePath(path_utils_3.stripTsExt(dep.path), fileNode, true);
                    meta.dependencies.push(path);
                });
            }
            else {
                if (fileNode.amdDependencies.length > 0) {
                    log_6.logWarn("Source file " + moduleName + " has <amd-dependency>, but is not a module (does not exports or imports anything). Dependency information will be lost.");
                }
                if (meta.altName) {
                    log_6.logWarn("Source file " + moduleName + " has <amd-module>, but is not a module (does not exports or imports anything). Value of module name will be lost.");
                }
            }
            return result;
        }
        fixModulePath(sourceModulePath, fileNode, isKnownPath = false) {
            let resultModulePath = this.resolver.getRootdirRelativePath(sourceModulePath, fileNode.fileName, isKnownPath);
            log_6.logDebug("Resolved module path " + sourceModulePath + " to " + resultModulePath + " (is known path = " + isKnownPath + ")");
            return resultModulePath || sourceModulePath;
        }
        fixDynamicImportNode(fileNode, node) {
            if (node.arguments.length !== 1) {
                log_6.logWarn("Dynamic import expession has " + node.arguments.length + " argument(s), expected exactly one.");
                return node;
            }
            let arg = node.arguments[0];
            if (!tsc.isStringLiteral(arg)) {
                log_6.logWarn("Dynamic import expession has argument that is not string literal as first argument.");
                return node;
            }
            let modulePath = arg.text;
            let isPath = path_utils_3.isTsExt(modulePath);
            if (isPath) {
                modulePath = path_utils_3.stripTsExt(modulePath);
            }
            return this.fixRewriteNode(fileNode, node, modulePath, (node, path) => {
                node.arguments = tsc.createNodeArray([tsc.createStringLiteral(path)]);
            }, isPath);
        }
        fixImportExportNode(fileNode, node) {
            let modulePath = getNodeModulePath(node);
            if (!modulePath)
                return node;
            return this.fixRewriteNode(fileNode, node, modulePath, (mutNode, resultModulePath) => {
                mutNode.moduleSpecifier = tsc.createStringLiteral(resultModulePath);
            });
        }
        fixImportEqualsNode(fileNode, node) {
            if (!tsc.isExternalModuleReference(node.moduleReference)) {
                log_6.logErrorAndExit("Unexpected: \"import = \" target is not module reference.");
            }
            if (!tsc.isStringLiteral(node.moduleReference.expression)) {
                log_6.logWarn("In file " + fileNode.fileName + ", \"import = \" is using non-constant reference name. This could lead to errors.");
                return node;
            }
            let modulePath = node.moduleReference.expression.text;
            return this.fixRewriteNode(fileNode, node, modulePath, (mutNode, resultModulePath) => {
                mutNode.moduleReference = tsc.createExternalModuleReference(tsc.createStringLiteral(resultModulePath));
            });
        }
        fixRewriteNode(fileNode, node, modulePath, mutate, isKnownPath = false) {
            let resultModulePath = this.fixModulePath(modulePath, fileNode, isKnownPath);
            if (resultModulePath === modulePath) {
                return node;
            }
            let mutNode = tsc.getMutableClone(node);
            mutate(mutNode, resultModulePath);
            return mutNode;
        }
        exploreExports(meta, fileNode) {
            export_explorer_1.processFileExports(fileNode, meta);
            meta.exportModuleReferences = [...new Set(meta.exportModuleReferences.map(x => this.fixModulePath(x, fileNode)))];
        }
        traverseDumpFileAst(fileNode) {
            let prefix = fileNode.fileName;
            if (prefix.length > 30) {
                prefix = "..." + prefix.substr(prefix.length - 30);
            }
            transformer_utils_1.visitNodeRecursive(fileNode, this.context, (node, depth) => {
                console.log(prefix + new Array(depth + 2).join("    ") + tsc.SyntaxKind[node.kind]);
                return node;
            });
        }
    }
    exports.BundlerTransformer = BundlerTransformer;
    function getNodeModulePath(node) {
        return node.moduleSpecifier ? getModuleSpecifierValue(node.moduleSpecifier) : null;
    }
    function getModuleSpecifierValue(specifier) {
        let leadingWidth = specifier.getLeadingTriviaWidth();
        const value = specifier.getText().substr(leadingWidth, specifier.getWidth() - (leadingWidth * 2));
        return value;
    }
});
define("compiler", ["require", "exports", "typescript", "path", "log", "transformer/bundler_transformer", "path_utils", "module_meta_storage", "bundler", "afs", "transformer/module_path_resolver", "transformer/transformer_utils"], function (require, exports, tsc, path, log_7, bundler_transformer_1, path_utils_4, module_meta_storage_1, bundler_1, afs_1, module_path_resolver_1, transformer_utils_2) {
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
                context => new bundler_transformer_1.BundlerTransformer(context, this.metaStorage, this.modulePathResolver),
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
                    context => ({
                        transformSourceFile(fileNode) {
                            let prefix = fileNode.fileName;
                            if (prefix.length > 30) {
                                prefix = "..." + prefix.substr(prefix.length - 30);
                            }
                            transformer_utils_2.visitNodeRecursive(fileNode, context, (node, depth) => {
                                console.log(prefix + new Array(depth + 2).join("    ") + tsc.SyntaxKind[node.kind]);
                                return node;
                            });
                            return fileNode;
                        },
                        transformBundle(node) {
                            return node;
                        }
                    })
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
                        if (path_utils_4.isPathNested(dirs[i], dirs[j])) {
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
            let name = path_utils_4.stripTsExt(this.modulePathResolver.getAbsoluteModulePath(absPath));
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
            let [modules, absentModules] = this.getSortedModules(entryPointModule);
            modules.forEach(name => this.detectRecursiveRefExport(name));
            return { modules, absentModules };
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
        getSortedModules(entryPoint) {
            let nameStack = new seq_set_1.SeqSet();
            let absentModules = new Set();
            let visit = (name) => {
                if (nameStack.has(name))
                    return;
                if (!this.storage.has(name)) {
                    absentModules.add(name);
                }
                else {
                    nameStack.push(name);
                    this.storage.get(name).dependencies.forEach(dep => visit(dep));
                }
            };
            visit(entryPoint);
            return [
                nameStack.seq.sort((a, b) => a < b ? -1 : a > b ? 1 : 0),
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
            let result = ["\"use strict\";"];
            if (!this.compiler.noLoaderCode) {
                result.push(this.getPrefixCode());
            }
            await this.loadAbsentModuleCode();
            let moduleOrder = new module_orderer_1.ModuleOrderer(this.compiler.metaStorage).getModuleOrder(this.compiler.entryModule);
            log_8.logDebug("Bundle related modules: " + JSON.stringify(moduleOrder));
            moduleOrder.modules.forEach(name => {
                let meta = this.compiler.metaStorage.get(name);
                let code = meta.jsCode;
                if (!code) {
                    throw new Error("Code for module " + name + " is not loaded at bundling time.");
                }
                result.push(this.getModuleEvalCode(name, meta, code));
            });
            if (!this.compiler.noLoaderCode) {
                result.push(this.getPostfixCode());
            }
            return result.join("\n");
        }
        getModuleEvalCode(name, meta, code) {
            let data = { name: name };
            if (meta.exports.length > 0) {
                data.exports = meta.exports;
            }
            if (meta.exportModuleReferences.length > 0) {
                data.exportRefs = meta.exportModuleReferences;
            }
            if (meta.hasOmniousExport) {
                data.arbitraryType = true;
            }
            return `define.e(${JSON.stringify(data)},${JSON.stringify(code)});`;
        }
        getLoaderPostfixCode() {
            return [
                !this.compiler.errorHandlerName ? null : `define.errorHandler=${this.compiler.errorHandlerName};`,
                `define.amdRequire=${this.compiler.amdRequireName};`,
                `define.commonjsRequire=${this.compiler.commonjsRequireName};`,
                `define.preferCommonjs=${this.compiler.preferCommonjs ? "true" : "false"};`
            ].filter(_ => !!_).join("\n");
        }
        getPrefixCode() {
            return loader_code_1.loaderCode + "\n" + this.getLoaderPostfixCode();
        }
        getPostfixCode(thenCode) {
            return `define.launch(${JSON.stringify(this.compiler.entryModule)},${JSON.stringify(this.compiler.entryFunction)}${thenCode ? "," + thenCode : ""});`;
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
                        discoverModuleDependencies(mod, moduleName);
                    })());
                }
            });
            if (proms.length > 0) {
                await Promise.all(proms);
            }
        }
    }
    exports.Bundler = Bundler;
    function discoverModuleDependencies(meta, moduleName) {
        if (!meta.hasImportOrExport) {
            return;
        }
        let result = null;
        function define(deps) {
            if (result) {
                throw new Error("Uncorrect module code for " + moduleName + ": expected no more than one invocation of define().");
            }
            result = deps.filter(_ => _ !== "exports" && _ !== "require");
        }
        void define;
        if (!meta.jsCode) {
            throw new Error("Could not discover dependencies of module " + moduleName + ": no code loaded.");
        }
        eval(meta.jsCode);
        if (!result) {
            throw new Error("Uncorrect module code for " + moduleName + ": expected at least one invocation of define().");
        }
        meta.dependencies = result;
    }
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
            if (!this.checkError(err, "compile-time", this.compileErrorText))
                return false;
            if (err)
                return true;
            try {
                if (!(await this.checkStdout()))
                    return false;
            }
            catch (e) {
                err = e;
            }
            if (!this.checkError(err, "runtime", this.runtimeErrorText))
                return false;
            if (err)
                return true;
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
