// see also https://requirejs.org/docs/node.html

let requirejs = require("requirejs");

requirejs.config({
    nodeRequire: require
});

requirejs(["js/bundle_wrapped"], function(bundle){
	console.log(bundle.meaningOfEverything + "! spice " + bundle.spice);
});