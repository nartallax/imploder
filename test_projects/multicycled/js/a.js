function (exports, require, d_1) {
    class A {
        constructor() {
            console.log(this instanceof d_1.D1 || this instanceof d_1.D2);
        }
    }
    exports.A = A;
}
