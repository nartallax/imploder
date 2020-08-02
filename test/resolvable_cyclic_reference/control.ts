import {Button} from "button"

let idCounter = 0;

export class Control {
	private prop: { new(): Button }
	id: number;
	constructor(){
		this.prop = Button;
		this.id = ++idCounter;
	}
}