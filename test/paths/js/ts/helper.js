function (exports, require, my_lib_1, other_lib_1) {
    function calc() {
        return my_lib_1.myLibValue + other_lib_1.otherLibValue;
    }
    exports.calc = calc;
}
