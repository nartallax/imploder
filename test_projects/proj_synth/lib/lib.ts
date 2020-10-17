/// <reference path="libns_b.ts" />
/// <amd-module name="the_lib_alt_name" />
// <amd-dependency path="libref.ts" />
import * as nl from "nested_lib/the_nested_lib";
import {LibNs} from "libns_a";
import omni = require("libomni");

export function helloWorld(){
	console.log("Hello world!" + typeof(nl) + omni);
}

export async function doTheThing(){
	let m = await import("libns_a");
	console.log(m.LibNs.count);
}

// тут я немного игрался с тем, какие бывают виды экспортов и как их обрабатывать

export class SampleLibClass {
	constructor(){
		console.log("Instance created!")
		console.log(LibNs.count);
	}
}

export {nestedHelloWorld, nestedHelloWorld as nestedHelloWorld2} from "nested_lib/the_nested_lib";
export * from "libref"; // export all exports from another module (except the default export)

export const libValue = 100500;
export var libVariable = 100501;

export var libVariableA = 100501, libVariableB = 100502;
export default { a: 5 };

const privateLibConst = 9000;
export { privateLibConst as someLibConst };