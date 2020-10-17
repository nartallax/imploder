import * as afb from "a_force_then_b";
import * as rafb from "rec_a_then_b";
import * as bfa from "b_force_then_a";
import * as rbfa from "rec_b_then_a";

/*
из этого теста мы узнаем, что явно реэкспортировать имена можно только в начале
т.е. допустимо следующее:

export {someval} from "a";
export * from "b";

но в рантайме упадет следующее:

export * from "b";
export {someval} from "a";

поэтому все, что проверяет этот тест - что коллизии имен, которые могут не упасть, не упадут
*/

export function main(){
	// value from a expected
	console.log(afb.someval);
	console.log(rafb.someval);

	// value from b expected
	console.log(bfa.someval);
	console.log(rbfa.someval);
}