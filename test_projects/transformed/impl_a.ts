import {SomeInterface} from "main";

export class ImplA implements SomeInterface {
	getString(): string {
		return "hello from implA"
	}
}

class ImplButNotExported implements SomeInterface {
	getString(): string {
		return "this should NOT appear as well"
	}
}

export function runNotExportedImpl(){
	console.log(new ImplButNotExported().getString());
}