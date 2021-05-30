import {updateCliArgsWithTsconfig} from "impl/config";
import {ImploderContextImpl} from "impl/context";
import {Imploder} from "imploder";
import * as path from "path";

export async function getTransformersFromImploderProject(projectTsconfigPath: string, context: Imploder.Context, params: {[k: string]: unknown} | undefined): Promise<Imploder.CustomTransformerDefinition[]> {	
	let config = updateCliArgsWithTsconfig({tsconfigPath: projectTsconfigPath});
	config.watchMode = false;
	config.noLoaderCode = false;
	config.embedTslib = false;
	let projectContext = new ImploderContextImpl(config)
	context.logger.debug("Building transformer project: " + projectTsconfigPath);
	await projectContext.compiler.run();
	await projectContext.bundler.produceBundle();
	if(!projectContext.compiler.lastBuildWasSuccessful){
		context.logger.errorAndExit("Transformer project " + projectTsconfigPath + " build failed.");
	}

	try {
		return getTransformersFromImploderBundle(projectContext.config.outFile, context, params);
	} catch(e: unknown){
		throw new Error("Failed to run transformer project " + projectTsconfigPath + ": " + ((e as Error).stack || (e + "")));
	}
}

export async function getTransformersFromImploderBundle(moduleName: string, context: Imploder.Context, params: {[k: string]: unknown} | undefined): Promise<Imploder.CustomTransformerDefinition[]> {
	let pathOrName = require.resolve(moduleName, {
		paths: [path.dirname(context.config.tsconfigPath)]
	})

	let moduleResult: unknown = require(pathOrName);
	let fn: Imploder.TransformerCreationFunction;
	switch(typeof(moduleResult)){
		case "function":
			fn = moduleResult as Imploder.TransformerCreationFunction;
			break;
		case "object":
			if(!moduleResult){
				throw new Error("Expected result of " + pathOrName + " to be non-null object, got " + moduleResult + " instead.");
			}
			let keys = Object.keys(moduleResult);
			if(keys.length < 1){
				throw new Error("Expected result of " + pathOrName + " to export something.");
			}
			let key: string;
			if(keys.length > 1){
				if(!("default" in moduleResult)){
					throw new Error("Module " + pathOrName + " exports more than one value, neither of which is named \"default\"; not sure what value to pick.");
				} else {
					key = "default";
				}
			} else {
				key = keys[0];
			}
		
			fn = (moduleResult as {[k: string]: any})[key] as Imploder.TransformerCreationFunction;
			if(typeof(fn) !== "function"){
				throw new Error("Expected result of " + pathOrName + " to export transformer creation function, got " + fn + " instead.");
			}
			break;
		default:
			throw new Error("Expected result of " + pathOrName + " to be object, got " + moduleResult + " instead.");
	}

	let execResult = await Promise.resolve(fn(context, params));
	let result = Array.isArray(execResult)? execResult: [execResult];

	result.forEach(result => validateTransformer(result, pathOrName, context));

	return result;
}

function validateTransformer(trans: Imploder.CustomTransformerDefinition, name: string, context: Imploder.Context){
	if(typeof(trans) !== "object" || trans === null){
		context.logger.errorAndExit("Transformer from " + name + " is not object (or is null): " + trans);
	}
	if(!trans.transformerName){
		context.logger.errorAndExit("Transformer from " + name + " has no name. This is not allowed.");
	}
	if(!trans.createForAfter && !trans.createForBefore){
		context.logger.errorAndExit("Transformer " + name + " has neither of instance creation functions. This is not allowed.");
	}
}