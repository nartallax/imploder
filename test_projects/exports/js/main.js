function (exports, require, exportdefault_1, eeq, linked, export_as_1) {
    function main() {
        console.log(exportdefault_1.default() + eeq() + linked.ordinaryValue + (linked.default || 0) + export_as_1.notSoOrdinaryValue);
    }
    exports.main = main;
}
