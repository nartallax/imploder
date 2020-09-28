function (exports, require, exportdefault_1, eeq, linked) {
    function main() {
        console.log(exportdefault_1.default() + eeq() + linked.ordinaryValue + (linked.default || 0));
    }
    exports.main = main;
}
