export function isPathNested(a: string, b: string): boolean {
	a = a.replace(/[\\/]/g, "/");
	b = b.replace(/[\\/]/g, "/");
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

	let partsA = a.split("/");
	let partsB = b.split("/");
	return partsA[partsB.length - 1] === partsB[partsB.length - 1];
}