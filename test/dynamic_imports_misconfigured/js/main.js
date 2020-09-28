function (exports, require) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.main = void 0;
    async function main() {
        console.log("importing...");
        let ref = await new Promise((resolve_1, reject_1) => { require(["./fs"], resolve_1, reject_1); });
        console.log(ref.x + "!");
    }
    exports.main = main;
}
