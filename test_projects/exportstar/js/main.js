function (exports, require, exporter_1, eee) {
    function main() {
        console.log(exporter_1.aval + exporter_1.bval + exporter_1.cval);
        for (let key in eee) {
            console.log(key);
        }
    }
    exports.main = main;
}
