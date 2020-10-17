import {InstA} from "inst_a";

export {someval} from "a";
export * from "b";

export class AbsA {
	constructor(){
		console.log(this instanceof InstA)
	}
}