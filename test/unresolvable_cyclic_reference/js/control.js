function (exports, require, button_1) {
    exports.SubButton = exports.Control = void 0;
    let idCounter = 0;
    class Control {
        constructor() {
            this.id = ++idCounter;
        }
    }
    exports.Control = Control;
    class SubButton extends button_1.Button {
    }
    exports.SubButton = SubButton;
}
