import {Button} from "button";

export * from "data";

export class Control {
	constructor(){
		if(this instanceof Button){
			console.log("Hooray!")
		}
	}
}