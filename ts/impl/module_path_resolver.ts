import * as path from "path";
import * as tsc from "typescript";
import {stripTsExt} from "utils/path_utils";
import {TSToolContext} from "./context";

export interface ModulePathResolver {
	/** если moduleDesignator указывает на модуль-файл - получить правильное имя модуля; иначе оставить его как есть */ 
	resolveModuleDesignator(moduleDesignator: string, sourceFile: string): string;

	/** привести имя файла-модуля проекта к каноничному виду */
	getCanonicalModuleName(localModuleNameOrPath: string): string;
}

/** класс, умеющий находить файлы исходников, в которых расположен модуль по ссылке на него */
export class ModulePathResolverImpl implements ModulePathResolver {

	private readonly moduleRoot: string;
	private readonly ambientModules: Set<string>;

	constructor(private readonly context: TSToolContext){
		this.moduleRoot = path.resolve(path.dirname(context.config.tsconfigPath), context.config.tscParsedCommandLine.options.rootDir || ".");
		let ambientMods = context.compiler.program.getTypeChecker().getAmbientModules().map(x => x.name.replace(/(?:^['"]|['"]$)/g, ""));
		this.ambientModules = new Set(ambientMods);
	}

	resolveModuleDesignator(moduleDesignator: string, sourceFile: string): string {
		if(this.ambientModules.has(moduleDesignator)){
			return moduleDesignator;
		}

		let res = tsc.resolveModuleName(
			moduleDesignator, 
			sourceFile, 
			this.context.compiler.program.getCompilerOptions(), 
			this.context.compiler.compilerHost
		);
		
		if(res.resolvedModule){
			if(res.resolvedModule.isExternalLibraryImport){
				return moduleDesignator;
			} else {
				return this.getCanonicalModuleName(res.resolvedModule.resolvedFileName);
			}
		}

		// тут я уже не знаю, что это и зачем это. просто оставляем в том виде, в котором есть
		return moduleDesignator;
	}

	getCanonicalModuleName(localModuleNameOrPath: string): string {
		return "/" + getRelativeModulePath(this.moduleRoot, localModuleNameOrPath);
	}

}

function normalizeModulePath(p: string): string {
	return stripTsExt(p.replace(/\\/g, "/"));
}

function getRelativeModulePath(startAt: string, relModulePath: string): string {
	return normalizeModulePath(path.relative(startAt, relModulePath));
}