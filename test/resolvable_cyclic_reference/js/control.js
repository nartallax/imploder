function (exports, require, button_1) {
    var idCounter = 0;
    var Control = /** @class */ (function () {
        function Control() {
            this.prop = button_1.Button;
            this.id = ++idCounter;
        }
        return Control;
    }());
    exports.Control = Control;
}
