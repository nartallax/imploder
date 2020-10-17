function (exports, require, tslib_1, button_1, data_1) {
    tslib_1.__exportStar(data_1, exports);
    class Control {
        constructor() {
            if (this instanceof button_1.Button) {
                console.log("Hooray!");
            }
        }
    }
    exports.Control = Control;
}
