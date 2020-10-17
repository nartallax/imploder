function (exports, require, tslib_1, inst_a_1, a_1, b_1) {
    Object.defineProperty(exports, "someval", { enumerable: true, get: function () { return a_1.someval; } });
    tslib_1.__exportStar(b_1, exports);
    class AbsA {
        constructor() {
            console.log(this instanceof inst_a_1.InstA);
        }
    }
    exports.AbsA = AbsA;
}
