function (exports, require) {
    function main() {
        let obj = { x: 5, y: 10 };
        let t = new Map();
        console.log(obj.x + " " + obj.y + " " + t.size);
    }
    exports.main = main;
}
