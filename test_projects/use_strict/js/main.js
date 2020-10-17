function (exports, require) {
    function main() {
        console.log(testFn());
    }
    exports.main = main;
    function testFn() {
        return typeof (this);
    }
}
