import { helloWorld } from "../lib";
import { nestedHelloWorld } from "../nested_lib/the_nested_lib";

export function helper(){
	helloWorld();
	nestedHelloWorld();
}