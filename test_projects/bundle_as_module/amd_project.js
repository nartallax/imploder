// see also https://requirejs.org/docs/node.html

let requirejs = require("requirejs");

requirejs.config({
    nodeRequire: require
});

requirejs([fullPathToWrappedBundle], function(bundle){
	console.log(bundle.meaningOfEverything + "! spice " + bundle.spice);
	testIsCompleted();
});
