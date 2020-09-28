function (exports, require, helper_1, my_lib_1, other_lib_1) {
    //import {INT_FIVE} from "more_ts/consts";
    function main() {
        console.log(helper_1.calc() + my_lib_1.myLibValue + other_lib_1.otherLibValue);
    }
    exports.main = main;
}
