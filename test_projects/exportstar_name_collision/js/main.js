function (exports, require, afb, rafb, bfa, rbfa) {
    /*
    из этого теста мы узнаем, что явно реэкспортировать имена можно только в начале
    т.е. допустимо следующее:
    
    export {someval} from "a";
    export * from "b";
    
    но в рантайме упадет следующее:
    
    export * from "b";
    export {someval} from "a";
    
    поэтому все, что проверяет этот тест - что коллизии имен, которые могут не упасть, не упадут
    */
    function main() {
        // value from a expected
        console.log(afb.someval);
        console.log(rafb.someval);
        // value from b expected
        console.log(bfa.someval);
        console.log(rbfa.someval);
    }
    exports.main = main;
}
