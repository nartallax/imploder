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
define(["require", "exports", "/control"], function (require, exports, control_1) {
    "use strict";
    exports.__esModule = true;
    var Button = /** @class */ (function (_super) {
        __extends(Button, _super);
        function Button() {
            return _super.call(this) || this;
        }
        return Button;
    }(control_1.Control));
    exports.Button = Button;
});
