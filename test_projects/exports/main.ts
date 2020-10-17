import edef from "exportdefault";
import eeq = require("exportequals");
import * as linked from "export_link_a";
import {notSoOrdinaryValue} from "export_as";


export function main(){
	console.log(edef() + eeq() + linked.ordinaryValue + ((linked as any).default || 0) + notSoOrdinaryValue);
}