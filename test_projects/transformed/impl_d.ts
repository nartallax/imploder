import {SomeInterface} from "main";

abstract class MySuperClass implements SomeInterface {
	abstract getString(): string;
}

export class ImplD extends MySuperClass {
	getString(){
		return "impl d";
	}
}