import * as Path from "path"
import * as Tsc from "typescript"
import {Imploder} from "imploder"
import {isPathNested} from "utils/path_utils"

/** класс, умеющий находить файлы исходников, в которых расположен модуль по ссылке на него */
export class ModulePathResolverImpl implements Imploder.ModulePathResolver {

	private readonly moduleRoot: string
	private readonly ambientModules: Set<string>

	constructor(private readonly context: Imploder.Context) {
		this.moduleRoot = Path.resolve(Path.dirname(context.config.tsconfigPath), context.config.tscParsedCommandLine.options.rootDir || ".")
		let ambientMods = context.compiler.program.getTypeChecker().getAmbientModules().map(x => x.name.replace(/(?:^['"]|['"]$)/g, ""))
		this.ambientModules = new Set(ambientMods)
	}

	resolveModuleDesignator(moduleDesignator: string, sourceFile: string): string {
		if(this.ambientModules.has(moduleDesignator)){
			return moduleDesignator
		}

		let res = Tsc.resolveModuleName(
			moduleDesignator,
			sourceFile,
			this.context.compiler.program.getCompilerOptions(),
			this.context.compiler.compilerHost
		)

		if(!res.resolvedModule){
			// тут я уже не знаю, что это и зачем это. просто оставляем в том виде, в котором есть
			return moduleDesignator
		}

		if(res.resolvedModule.isExternalLibraryImport){
			// never alter import from node_modules
			return moduleDesignator
		}

		if(isPathNested(res.resolvedModule.resolvedFileName, this.moduleRoot)){
			let filename = res.resolvedModule.resolvedFileName.toLowerCase()
			if(filename.endsWith(".ts") && !filename.endsWith(".d.ts")){
				// это просто один из наших файлов-модулей. канонизируем имя
				return this.getCanonicalModuleName(res.resolvedModule.resolvedFileName)
			}

			// если нет - то непонятно, что это такое. ссылка на внешний модуль, который лежит у нас посреди .ts?
			// что? зачем?
		}

		// это ссылка не на просто наш локальный файл-модуль, а на какой-то внешний файл
		// тут я вряд ли что-то смогу угадать на тему того, что хочет пользователь
		// оставляем как есть
		return moduleDesignator
	}

	getCanonicalModuleName(localModuleNameOrPath: string): string {
		return "/" + getRelativeModulePath(this.moduleRoot, localModuleNameOrPath)
	}

}

const tsFileExtensions: ReadonlySet<string> = new Set([".ts", ".tsx"])
const fileExtensionRegexp = /\.[^.]+$/

function isTsExt(path: string): boolean {
	let extMatch = path.match(fileExtensionRegexp)
	if(!extMatch){
		return false
	}
	let ext = extMatch[0].toLowerCase()
	return tsFileExtensions.has(ext)
}

function stripTsExt(path: string): string {
	return isTsExt(path) ? path.replace(fileExtensionRegexp, "") : path
}

function normalizeModulePath(p: string): string {
	return stripTsExt(p.replace(/\\/g, "/"))
}

function getRelativeModulePath(startAt: string, relModulePath: string): string {
	return normalizeModulePath(Path.relative(startAt, relModulePath))
}