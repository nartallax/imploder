import * as tsc from "typescript";
import * as path from "path";
import {logWarn} from "log";
import {OMap} from "utils";
import {typescriptFileExists, joinModulePath, stripTsExt} from "path_utils";

// штуки для работы с compilerOption.paths
// теоретически, есть вот такая штука https://github.com/dividab/tsconfig-paths/blob/master/src/match-path-sync.ts
// но я не хочу привносить лишние зависимости, и копировать тоже не хочу, поэтому нет

export type PathMatcher = (path: string) => string | null;

/** создать функцию, которая по абсолютному имени модуля будет выдавать абсолютный путь к нему
 * null означает отсутствие маппинга. обычно это означает, что зависимость будет подгружена средствами среды в рантайме
 * не работает для относительных путей
 */
export function getModulePathMatcher(compilerOptions: tsc.CompilerOptions, tsconfigPath: string): PathMatcher {
	let absBaseUrl = compilerOptions.baseUrl || ".";
	if(!isPathAbsolute(absBaseUrl)){
		// relative baseUrl should be resolved from tsconfig.json location
		absBaseUrl = path.join(path.dirname(tsconfigPath), absBaseUrl);
	}
	
	let mappings = parsePathsFromTsconfig(absBaseUrl, compilerOptions.paths || {});

	return modulePath => tryApplyMappings(mappings, modulePath);
}

type PathMappings = {fixed: OMap<string>, wildcard: OMap<string[]>}

/** преобразовать значение compilerOptions.paths в более удобное для употребления значение */
function parsePathsFromTsconfig(absBaseUrl: string, paths: { [k: string]: string[] }): PathMappings{
	let fixedMappings: OMap<string> = {};
	let wildcardMappings: OMap<string[]> = {};

	for(let moduleNamePart in paths){
		let pathParts = paths[moduleNamePart];
		if(moduleNamePart.endsWith("*")){
			let nonWildPaths = pathParts.filter(_ => !_.endsWith("*"));
			if(nonWildPaths.length > 0){
				logWarn("Value of paths compiler option is strange: as key \"" 
					+ moduleNamePart + "\" is wildcard, value(s) \"" 
					+ nonWildPaths.join("\", \"") + "\" are not. Will treat them as wildcarded.");
			}
			let cleanAbsPaths = pathParts.map(_ => path.join(absBaseUrl, _.replace(/\*$/, "")));
			let cleanNamePart = moduleNamePart.replace(/\*$/, "");
			wildcardMappings[cleanNamePart] = cleanAbsPaths;
		} else {
			let wildPaths = pathParts.filter(_ => _.endsWith("*"));
			if(wildPaths.length > 0){
				logWarn("Value of paths compiler option is strange: as key \"" 
					+ moduleNamePart + "\" is not wildcard, value(s) \"" 
					+ wildPaths.join("\", \"") + "\" are. I don't know what do you expect from this; will ignore this value(s).");
			}
			let existingValues = pathParts
				.filter(_ => !_.endsWith("*"))
				.map(_ => path.join(absBaseUrl, _))
				.filter(_ => tsc.sys.fileExists(_))
				.map(_ => stripTsExt(_))
			if(existingValues.length < 1){
				logWarn("Found none of targets of path \"" + moduleNamePart + "\": tried \"" + existingValues.join("\", \"") + "\".");
			} else {
				// насколько я понимаю документацию, указание нескольких значений маппинга должно работать как fallback
				// т.е. нужно брать первый подходящий
				fixedMappings[moduleNamePart] = existingValues[0];
			}
		}
	}

	return {
		fixed: fixedMappings,
		wildcard: wildcardMappings
	}
}

function isPathAbsolute(p: string): boolean {
	if(!p)
		return false;

	// здесь мы не можем просто полагаться на нативный path.isAbsolute
	// потому что он сработает неправильно в случае конфига, писаного под виндой, а запускаемого под юниксами
	// и наоборот
	// зачем такое кому-то может пригодиться - неизвестно, но на всякий случай лучше сделать так
	let isUnixAbsolutePath = p[0] === "/";
	let isWindowsAbsolutePath = /^[A-Z]:\//.test(p);
	return isUnixAbsolutePath || isWindowsAbsolutePath;
}

/** попытаться, используя маппинги путей, получить абсолютный путь к файлу модуля */
function tryApplyMappings(mappings: PathMappings, modulePath: string): string | null {
	let fixedPath = mappings.fixed[modulePath];
	if(fixedPath)
		return fixedPath;

	let matchedPrefixes: string[] = [];
	let matchedFiles: string[] = [];
	for(let modulePrefix in mappings.wildcard){
		if(modulePath.startsWith(modulePrefix)){
			matchedPrefixes.push(modulePrefix);
			let pathPostfix = modulePath.substr(modulePrefix.length);
			for(let pathPrefix of mappings.wildcard[modulePrefix]){
				let fullModulePath = joinModulePath(pathPrefix, pathPostfix);
				if(typescriptFileExists(fullModulePath)){
					matchedFiles.push(fullModulePath);
				}
			}
		}
	}

	if(matchedFiles.length === 1){
		return matchedFiles[0];
	}

	if(matchedPrefixes.length > 0){
		if(matchedFiles.length < 1){
			logWarn("For module dependency path \"" 
				+ modulePath + "\" there some wildcard path roots that are matched (\"" 
				+ matchedPrefixes.join("\", \"") + "\"), but no file is found within these roots.");
		} else {
			logWarn("For module dependency path \"" 
				+ modulePath + "\" there some wildcard path roots that are matched (\"" 
				+ matchedPrefixes.join("\", \"") + "\", and multiple files are found within these roots: \""
				+ matchedFiles.join("\", \"") + "\". For sake of consistency, will pick neither of them.");
		}
	}

	return null;
}