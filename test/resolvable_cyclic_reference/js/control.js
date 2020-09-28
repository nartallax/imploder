function (exports, require, button_1) {
    let idCounter = 0;
    class Control {
        constructor() {
            this.prop = button_1.Button;
            this.id = ++idCounter;
        }
    }
    exports.Control = Control;
}
