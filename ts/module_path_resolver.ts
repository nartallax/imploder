import * as path from "path";
import * as tsc from "typescript";
import {getModulePathMatcher, PathMatcher} from "./tsconfig_paths_parser";
import {getRelativeModulePath, isModulePathRelative, isPathNested, typescriptFileExists, joinModulePath} from "path_utils";
import {logError, logDebug} from "log";

/** класс, умеющий находить файлы исходников, в которых расположен модуль по ссылке на него */
export class ModulePathResolver {

	private readonly pathMatcher: PathMatcher;
	private readonly rootDirWrangler: RootDirWrangler;
	private readonly moduleRoot: string;

	constructor(tsconfigPath: string, compilerOpts: tsc.CompilerOptions){
		this.pathMatcher = getModulePathMatcher(compilerOpts, tsconfigPath); 
		this.moduleRoot = path.resolve(path.dirname(tsconfigPath), compilerOpts.rootDir || ".");
		this.rootDirWrangler = new RootDirWrangler(this.moduleRoot, compilerOpts.rootDirs);
	}

	/** имея ссылку из одного файла модуля на другой,
	 * получить путь к этому другому файлу относительно директории rootDir
	 * isKnownPath = известно, что этот moduleDesignator - точно путь, а не имя модуля */
	protected getRootdirRelativePath(moduleDesignator: string, sourceFile: string, isKnownPath: boolean = false): string | null {
		// здесь нам нужно получать абсолютный путь к файлу, на который ссылается импорт
		// в данный момент мы вручную учитываем все (?) возможные случаи (paths, rootDirs)
		// но это отстой. но альтернатив на момент написания этого кода нет
		// есть иссуй: https://github.com/microsoft/TypeScript/issues/33994
		// если его когда-нибудь порезолвят - то нужно будет сделать через него, выкинув этот класс и еще пару
		if(isModulePathRelative(moduleDesignator) || isKnownPath){
			// если мы точно знаем, что у нас модуль указан в виде пути - резолвим относительный путь
			// (иногда имя модуля не выглядит как путь, но из-за того, как оно указано, оно является путем, отсюда и нужен флаг)
			// (такое указание - например, через ///<amd-dependency>)
			return "/" + this.rootDirWrangler.getRelativePath(sourceFile, moduleDesignator);
		} else {
			// если moduleDesignator - это не путь, то пробуем искать его "начальный кусок" среди paths
			// если нашли - то резолвим относительно найденного элемента paths
			// если не нашли - то это, скорее всего, имя внешнего модуля, которое нужно так и оставить
			void mappedModulePathToRelative;
			let abs = this.pathMatcher(moduleDesignator);
			return abs? this.getAbsoluteModulePath(abs): moduleDesignator;
		}
	}
	
	/** если moduleDesignator указывает на модуль-файл - получить полный путь к moduleDesignator; иначе оставить его как есть */ 
	resolveModuleDesignator(moduleDesignator: string, sourceFile: string, isKnownPath: boolean = false): string {
		let resultModulePath = this.getRootdirRelativePath(moduleDesignator, sourceFile, isKnownPath);
		logDebug("Resolved module path " + moduleDesignator + " to " + resultModulePath + " (is known path = " + isKnownPath + ")");
		
		return resultModulePath || moduleDesignator;
	}

	getAbsoluteModulePath(absPath: string): string {
		return "/" + getRelativeModulePath(this.moduleRoot, absPath);
	}

}

class RootDirWrangler {

	private readonly rootDirs: string[] | undefined;
	private readonly rootDir: string;

	constructor(rootDir: string, rootDirs: string[] | undefined){
		this.rootDir = rootDir;
		this.rootDirs = rootDirs;
	}

	getRelativePath(sourceFile: string, modulePath: string): string | null {
		if(!this.rootDirs){
			// опция rootDirs не задана, резолвим по-простому
			return getRelativeModulePath(this.rootDir, path.resolve(path.dirname(sourceFile), modulePath));
		}

		let sourceRootDir = this.rootDirs.find(_ => isPathNested(_, sourceFile));
		if(!sourceRootDir){
			logError("Source file \"" + sourceFile + "\" is not found in any of rootDirs. Don't know how to resolve relative dependencies of it.");
			return null;
		}

		let fakeAbsPath = path.resolve(path.dirname(sourceFile), modulePath);
		let targetRootRelPath = getRelativeModulePath(sourceRootDir, fakeAbsPath);

		let targetRootDirs = this.rootDirs.filter(_ => typescriptFileExists(joinModulePath(_, targetRootRelPath)))
		if(targetRootDirs.length < 1){
			logError("Relative dependency \"" + modulePath + "\" (referenced from \"" + sourceFile + "\") is not found in any of rootDirs.");
			return null;
		}
		if(targetRootDirs.length > 1){
			logError("Relative dependency \"" + modulePath + "\" (referenced from \"" + sourceFile + "\") is not found in more than one of rootDirs: \"" + targetRootDirs.join("\", \"") + "\". Could not decide; won't pick any.");
			return null;
		}
		let targetRootDir = targetRootDirs[0];
		
		return getRelativeModulePath(this.rootDir, path.join(targetRootDir, targetRootRelPath));
	}

}

function mappedModulePathToRelative(sourcePath: string, absModulePath: string, matcher: PathMatcher): string | null {
	let resolvedPath = matcher(absModulePath);
	if(!resolvedPath){
		return null;
	}
	let result = getRelativeModulePath(sourcePath, resolvedPath);
	if(!isModulePathRelative(result)){ 
		// path.relative не дописывает ./ в начало, а надо бы
		result = "./" + result;
	}
	return result;
}
