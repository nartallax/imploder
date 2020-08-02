define(["require", "exports", "/lib/my_lib", "/lib/other_lib"], function (require, exports, my_lib_1, other_lib_1) {
    "use strict";
    exports.__esModule = true;
    function calc() {
        return my_lib_1.myLibValue + other_lib_1.otherLibValue;
    }
    exports.calc = calc;
});
