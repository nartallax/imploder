function (exports, require, tslib_1, button_1) {
    exports.SubButton = exports.Control = void 0;
    var idCounter = 0;
    var Control = /** @class */ (function () {
        function Control() {
            this.id = ++idCounter;
        }
        return Control;
    }());
    exports.Control = Control;
    var SubButton = /** @class */ (function (_super) {
        tslib_1.__extends(SubButton, _super);
        function SubButton() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        return SubButton;
    }(button_1.Button));
    exports.SubButton = SubButton;
}
