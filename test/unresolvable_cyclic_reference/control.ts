import {Button} from "button"

let idCounter = 0;

export class Control {
	id: number;
	constructor(){
		this.id = ++idCounter;
	}
}

export class SubButton extends Button {}