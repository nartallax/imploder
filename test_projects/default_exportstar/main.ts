import * as exp from "exporter";
import zz from "wdef";

export function main(){
	console.log(zz);
	console.log(typeof((exp as any)["default"]));
	console.log(zz + exp.someval);
}