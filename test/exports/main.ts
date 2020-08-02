import edef from "exportdefault";
import eeq = require("exportequals");
import * as linked from "export_link_a";


export function main(){
	console.log(edef() + eeq() + linked.ordinaryValue + ((linked as any).default || 0));
}