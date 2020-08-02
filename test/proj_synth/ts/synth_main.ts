import { helper } from "./helpers/helper";
import lib from "lib";
//import helper = require("./helpers/helper");

export function main(){
	helper();
	console.log("Lib default export is " + lib);
}