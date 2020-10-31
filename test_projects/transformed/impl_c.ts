import {SomeInterface} from "main";

export interface SomeSubInterface extends SomeInterface {}

export class ImplC implements SomeSubInterface {
	getString(){
		return "implc"
	}
}