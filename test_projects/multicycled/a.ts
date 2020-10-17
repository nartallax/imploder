import {D1, D2} from "d";

export class A {
	constructor(){
		console.log(this instanceof D1 || this instanceof D2)
	}
}