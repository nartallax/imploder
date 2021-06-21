import {aaaaa} from "aaaaa";
import {myClassEnumeration} from "generated";
import * as impla from "impl_a";

export interface SomeInterface {
	getString(): string;
}

export function main(){
	void impla;
	let result = myClassEnumeration.map(cls => new cls().getString()).join("; ");
	console.log(result + aaaaa);
}