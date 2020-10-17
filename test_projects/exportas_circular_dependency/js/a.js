function (exports, require, b_1, b_2) {
    Object.defineProperty(exports, "myval", { enumerable: true, get: function () { return b_2.someval; } });
    class A {
        constructor() {
            console.log(this instanceof b_1.B);
        }
    }
    exports.A = A;
}
