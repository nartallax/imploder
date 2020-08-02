import * as path from "path";
import * as tsc from "typescript";

const tsFileExtensions: ReadonlySet<string> = new Set([".ts", ".tsx"]);

export function isModulePathRelative(modulePath: string): boolean {
	return modulePath.startsWith("./") || modulePath.startsWith("../")
}

export function normalizeModulePath(p: string): string {
	return p.replace(/\\/g, "/");
}

export function getRelativeModulePath(startAt: string, relModulePath: string): string {
	return normalizeModulePath(path.relative(startAt, relModulePath));
}

export function joinModulePath(a: string, b: string): string {
	return normalizeModulePath(path.join(a, b));
}

export function isPathNested(a: string, b: string): boolean {
	if(a === b){
		return false;
	}
	
	let starts = a.startsWith(b);
	if(!starts && b.startsWith(a)){
		starts = true;
		let c = b;
		b = a;
		a = c;
	}
	if(!starts)
		return false;

	let partsA = a.split(/[\\\/]/);
	let partsB = b.split(/[\\\/]/);
	return partsA[partsB.length - 1] === partsB[partsB.length - 1];
}

export function isTsExt(path: string): boolean {
	let extMatch = path.match(/\.[^\.]+$/);
	if(!extMatch)
		return false;
	let ext = extMatch[0].toLowerCase();
	return tsFileExtensions.has(ext);
}

export function stripTsExt(path: string): string {
	return isTsExt(path)? path.replace(/\.[^\.]+$/, ""): path;
}

export function typescriptFileExists(extensionlessAbsolutePath: string): boolean {
	let allFilesInDir = tsc.sys.readDirectory(path.dirname(extensionlessAbsolutePath));
	return !!allFilesInDir.find(fileInDir => {
		fileInDir = normalizeModulePath(fileInDir.toLowerCase());
		return fileInDir.startsWith(extensionlessAbsolutePath.toLowerCase()) 
			&& tsFileExtensions.has(fileInDir.substr(extensionlessAbsolutePath.length));
	})
}
