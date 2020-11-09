export function main(){
	for(let i = 0; i < 3; i++){
		let v = getBoolOrNothing(i);
		console.log(i + " " + typeof(v) + " " + v);
	}
	for(let i = 3; i < 6; i++){
		let v: boolean = !!getBoolOrNothing(i);
		console.log(i + " " + typeof(v) + " " + v);
	}
	for(let i = 6; i < 9; i++){
		let v = getBool(i);
		console.log(i + " " + typeof(v) + " " + v);
	}
	for(let i = 9; i < 12; i++){
		let v = ((i % 3) as any) === false;
		console.log(i + " " + typeof(v) + " " + v);
	}
	for(let i = 12; i < 15; i++){
		let v = ((i % 3) as any) == false;
		console.log(i + " " + typeof(v) + " " + v);
	}
}

function getBoolOrNothing(n: number): boolean | undefined {
	return (n % 3) === 0? undefined: (n % 3) === 1;
}

function getBool(n: number): boolean | undefined {
	return !!getBoolOrNothing(n);
}