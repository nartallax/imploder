"use strict";
define.e({"name":"/lib/my_lib","exports":["myLibValue"]},"define([\"require\", \"exports\"], function (require, exports) {\n    \"use strict\";\n    exports.__esModule = true;\n    exports.myLibValue = 10;\n});\n");
define.e({"name":"/lib/other_lib","exports":["otherLibValue"]},"define([\"require\", \"exports\"], function (require, exports) {\n    \"use strict\";\n    exports.__esModule = true;\n    exports.otherLibValue = 5;\n});\n");
define.e({"name":"/ts/helper","exports":["calc"]},"define([\"require\", \"exports\", \"/lib/my_lib\", \"/lib/other_lib\"], function (require, exports, my_lib_1, other_lib_1) {\n    \"use strict\";\n    exports.__esModule = true;\n    function calc() {\n        return my_lib_1.myLibValue + other_lib_1.otherLibValue;\n    }\n    exports.calc = calc;\n});\n");
define.e({"name":"/ts/main","exports":["main"]},"define([\"require\", \"exports\", \"/ts/helper\"], function (require, exports, helper_1) {\n    \"use strict\";\n    exports.__esModule = true;\n    function main() {\n        console.log(helper_1.calc());\n    }\n    exports.main = main;\n});\n");