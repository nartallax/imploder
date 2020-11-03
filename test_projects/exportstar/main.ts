import {aval, bval, cval} from "exporter";
import * as eee from "exporter";

export function main(){
	console.log(aval + bval + cval);
	console.log(Object.keys(eee).sort().join("\n"));
}