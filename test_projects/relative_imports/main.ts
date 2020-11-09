import {funB} from "./dir_a/dir_b/in_b";

export function glue(a: string, b: string): string {
	return a + "|" + b;
}

export function main(){
	console.log(funB());
}