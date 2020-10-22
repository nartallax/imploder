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

const tsFileExtensions: ReadonlySet<string> = new Set([".ts", ".tsx"]);

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