import {MyObj, MyType} from "types";

export function main(){
	let obj: MyObj = {x: 5, y: 10};
	let t: MyType<string> = new Map();
	console.log(obj.x + " " + obj.y + " " + t.size)
}