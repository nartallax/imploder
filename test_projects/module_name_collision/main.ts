import * as pathNode from "path";
import * as pathCustom from "./path";
import * as smth from "terser";
import * as fs from "fs";
import {ttt} from "my_mod";

export function main(){
	console.log(typeof(pathNode.basename));
	console.log(typeof(pathCustom.yay));
	console.log(typeof(smth));
	console.log(typeof(fs));
	console.log(ttt);
}