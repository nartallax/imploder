import {aval, bval, cval} from "exporter";
import * as eee from "exporter";

export function main(){
	console.log(aval + bval + cval);
	for(let key in eee){
		console.log(key);
	}
}