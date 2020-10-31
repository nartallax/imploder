import {myClassEnumeration} from "generated";

export interface SomeInterface {
	getString(): string;
}

export function main(){
	let result = myClassEnumeration.map(cls => new cls().getString()).join("; ");
	console.log(result);
}