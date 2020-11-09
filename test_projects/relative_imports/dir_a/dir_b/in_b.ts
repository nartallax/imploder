import {funA} from "../in_a";
import {glue} from "../../main";

export function funB(): string {
	return glue(funA(), funA());
}