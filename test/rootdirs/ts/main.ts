import {getValue} from "./lib";
import {getValue2} from "lib/lib2";
import {fromRootDirVal} from "in_root";

export function main(){
	console.log(getValue() + getValue2() + fromRootDirVal);
}