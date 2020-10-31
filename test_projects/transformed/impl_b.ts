import {SomeInterface as ThereIsNoSpoon} from "main";

export class ImplB implements ThereIsNoSpoon {
	getString(): string {
		return "this is implB"
	}
}

export class NotImpl {
	getString(): string {
		return "this should NOT appear"
	}
}

export namespace MyNS {
	export class ImplButInNamespace implements ThereIsNoSpoon {
		getString(): string {
			return "also should not appear"
		}
	}
}