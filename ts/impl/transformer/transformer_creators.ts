import {updateCliArgsWithTsconfig} from "impl/config";
import {ImploderContextImpl} from "impl/context";
import {Imploder} from "imploder";
import * as Path from "path";
import type * as Tsc from "typescript";

export interface TransformerRefWithFactory {
	ref: Imploder.TransformerReference
	factory: Imploder.CustomTransformerFactory;
}

/** Имея описание трансформера, получить трансформер */
export async function createTransformerFromTransformerRef(context: Imploder.Context, ref: Imploder.TransformerReference): Promise<TransformerRefWithFactory> {
	if(!ref.transform){
		throw new Error(`Expected transformer ${JSON.stringify(ref)} to have "transform" parameter present.`);
	}

	let moduleName = ref.transform;
	if(ref.imploderProject){
		moduleName = await buildTransformerImploderProjectToBundle(moduleName, context);
	}

	return await getTransformerFromPackage(moduleName, context, ref);
}

/** Собрать Imploder-проект, выдать путь к файлу-результату */
async function buildTransformerImploderProjectToBundle(projectTsconfigPath: string, context: Imploder.Context): Promise<string>{	
	projectTsconfigPath = Path.resolve(Path.dirname(context.config.tsconfigPath), projectTsconfigPath);
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

	return projectContext.config.outFile;
}

/** Имея package, получить из него Imploder.CustomTransformerFactory */
async function getTransformerFromPackage(moduleName: string, context: Imploder.Context, ref: Imploder.TransformerReference): Promise<TransformerRefWithFactory> {
	let fn = extractFactoryCreationFunctionFromPackage(moduleName, context, ref)
	let factory = await runFactoryCreationFunction(fn, context, ref);
	let result = {ref, factory};
	validateTransformerFactory(result, moduleName, context)
	return result;
}

/** Функция, создающая фабрику трансформеров
 * Сам по себе тип не имеет особого смысла, в месте вызова функция кастится к одному из типов в зависимости от настроек */
type TransformerFactoryFactory = (x: never) => Imploder.CustomTransformerFactory

/** Имея package, получить из него функцию, которая создаст нам Imploder.CustomTransformerFactory */
function extractFactoryCreationFunctionFromPackage(moduleName: string, context: Imploder.Context, ref: Imploder.TransformerReference): TransformerFactoryFactory {
	let pathOrName = require.resolve(moduleName, {
		paths: [Path.dirname(context.config.tsconfigPath)]
	})

	let moduleResult: unknown = require(pathOrName);
	let fn: TransformerFactoryFactory;
	switch(typeof(moduleResult)){
		case "function":
			fn = moduleResult as TransformerFactoryFactory;
			break;
		case "object": {
			if(!moduleResult){
				throw new Error("Expected result of " + pathOrName + " to be non-null object, got " + moduleResult + " instead.");
			}

			if(ref.import){
				if(!(ref.import in moduleResult)){
					throw new Error(`Package ${pathOrName} does not contains exported value ${ref.import} (that is mentioned in tranfromer plugin entry)`);
				}
				fn = (moduleResult as Record<string, TransformerFactoryFactory>)[ref.import];
				break;
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
		
			fn = (moduleResult as Record<string, TransformerFactoryFactory>)[key];
			break;
		}
		default:
			throw new Error(`Expected product of package ${pathOrName} to be object, got ${moduleResult} (of type ${typeof(moduleResult)}) instead.`);
	}

	if(typeof(fn) !== "function"){
		throw new Error(`Expected ${pathOrName} to export transformer creation function, got ${fn} (of type ${typeof(fn)}) instead.`);
	}

	return fn;
}

// завернуть функцию создания трансформер-фабрики в еще одну функцию
// нужно оно для того, чтобы трансформер-фабрика создавалась отложенно
// потому что в некоторых случаях она требует значений, которых нет в момент подгрузки трансформера из модуля
// например, program (потому что компилятор еще не запущен)
// из минусов - это вносит неконсистентность между типами "program" и "imploder"
// потому что imploder запускает функцию сразу же, что позволяет, например, генерить какие-нибудь файлы на старте
function lazyWrapFactoryCreator(fn: () => Imploder.CustomTransformerFactory): Imploder.CustomTransformerFactory {
	let factory: Imploder.CustomTransformerFactory | null = null;
	return transformContext => {
		return (factory ||= fn())(transformContext)
	}
}

async function runFactoryCreationFunction(fnValue: TransformerFactoryFactory, context: Imploder.Context, ref: Imploder.TransformerReference): Promise<Imploder.CustomTransformerFactory> {
	switch(ref.type || "program"){
		case "program": {
			let fn = fnValue as unknown as 
				(program: Tsc.Program, config: Imploder.TransformerReference) => Imploder.CustomTransformerFactory;
			return lazyWrapFactoryCreator(() => fn(context.compiler.program, ref));
		}
		case "config": {
			let fn = fnValue as unknown as
				(config: Imploder.TransformerReference) => Imploder.CustomTransformerFactory;
			return fn(ref);
		}
		case "checker": {
			let fn = fnValue as unknown as
				(checker: Tsc.TypeChecker, config: Imploder.TransformerReference) => Imploder.CustomTransformerFactory;
			return lazyWrapFactoryCreator(() => fn(context.compiler.program.getTypeChecker(), ref));
		}
		case "raw": {
			let fn = fnValue as unknown as Imploder.CustomTransformerFactory;
			return fn;
		}
		case "compilerOptions": {
			let fn = fnValue as unknown as
				(compilerOpts: Tsc.CompilerOptions, config: Imploder.TransformerReference) => Imploder.CustomTransformerFactory;
			return fn(context.config.tscParsedCommandLine.options, ref);
		}
		case "imploder": {
			let fn = fnValue as unknown as
				(imploderContext: Imploder.Context, config: Imploder.TransformerReference) => Imploder.CustomTransformerFactory;
			return await Promise.resolve(fn(context, ref));
		}
		default: throw new Error(`Could not get transformer factory out of ${ref.transform}: unknown type ${JSON.stringify(ref.type)}`);
	}
}

function validateTransformerFactory(ref: TransformerRefWithFactory, name: string, context: Imploder.Context){
	if(typeof(ref.factory) !== "function"){
		context.logger.errorAndExit(`Transformer from ${name} is not function: ${ref.factory} (of type ${typeof(ref.factory)})`);
	}

	if(ref.ref.after && ref.ref.afterDeclarations){
		context.logger.errorAndExit(`Transformer from ${name} has both "after" and "afterDeclarations", which is not allowed (as it is unclear when to launch the transformer)`);
	}
}