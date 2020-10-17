import {InstB} from "inst_b";

export {someval} from "b";
export * from "a";

export class AbsB {
	constructor(){
		console.log(this instanceof InstB)
	}
}