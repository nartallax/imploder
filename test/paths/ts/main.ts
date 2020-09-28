import { calc } from "helper"
import {myLibValue} from "l/my_lib";
import {otherLibValue} from "../lib/other_lib";
import {INT_FIVE} from "more_ts/consts";

export function main(){
	console.log(calc() + myLibValue + otherLibValue + INT_FIVE);
}