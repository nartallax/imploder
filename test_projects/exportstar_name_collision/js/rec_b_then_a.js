function (exports, require, tslib_1, inst_b_1, b_1, a_1) {
    Object.defineProperty(exports, "someval", { enumerable: true, get: function () { return b_1.someval; } });
    tslib_1.__exportStar(a_1, exports);
    class AbsB {
        constructor() {
            console.log(this instanceof inst_b_1.InstB);
        }
    }
    exports.AbsB = AbsB;
}
