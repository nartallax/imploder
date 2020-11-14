import {badValue} from "forbidden_knowledge/consts";
import {globConst} from "glob_util";
import {duplicate} from "utils/util";

export function main(){
	console.log(duplicate(globConst + " " + badValue))
}