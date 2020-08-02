var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
define(["require", "exports", "/button"], function (require, exports, button_1) {
    "use strict";
    exports.__esModule = true;
    var idCounter = 0;
    var Control = /** @class */ (function () {
        function Control() {
            this.id = ++idCounter;
        }
        return Control;
    }());
    exports.Control = Control;
    var SubButton = /** @class */ (function (_super) {
        __extends(SubButton, _super);
        function SubButton() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        return SubButton;
    }(button_1.Button));
    exports.SubButton = SubButton;
});
