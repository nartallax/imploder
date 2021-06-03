import {Button} from "a";

export class Page {
	constructor(){
		this.getButton();
	}

	getButton(): Button {
		return new Button(this);
	}

	notify(){}
}

export * from "../../some_external_module";