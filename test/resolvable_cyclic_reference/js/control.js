define(["require", "exports", "/button"], function (require, exports, button_1) {
    "use strict";
    exports.__esModule = true;
    var idCounter = 0;
    var Control = /** @class */ (function () {
        function Control() {
            this.prop = button_1.Button;
            this.id = ++idCounter;
        }
        return Control;
    }());
    exports.Control = Control;
});
