import {Page, someFunction} from "b";

export class Button {
	constructor(page: Page){
		page.notify();
		console.log(someFunction("meow-meow!"));
	}


}