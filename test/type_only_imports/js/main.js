define(["require", "exports"], function (require, exports) {
    "use strict";
    exports.__esModule = true;
    exports.main = void 0;
    function main() {
        var obj = { x: 5, y: 10 };
        var t = new Map();
        console.log(obj.x + " " + obj.y + " " + t.size);
    }
    exports.main = main;
});
