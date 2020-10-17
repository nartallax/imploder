import {B} from "b";

export {someval as myval} from "b";

export class A {
	constructor(){
		console.log(this instanceof B)
	}
}