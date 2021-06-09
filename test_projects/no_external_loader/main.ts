export function main(){
	if(typeof(require) !== "function"){
		throw new Error("Expected require() to be function regardless of it's external deletion, but have " + require);
	}

	let err: Error | null = null;
	try {
		let tslib = require("tslib");
		console.error("typeof(tslib) = " + typeof(tslib) + " (" + tslib + ")");
	} catch(e){
		err = e;
	}

	if(err.message !== "External require() function is not defined! Could not load any external module."){
		throw new Error("Incorrect error message: " + err.message);
	}

	console.log("Passed");
}