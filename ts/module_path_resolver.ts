import * as path from "path";
import * as tsc from "typescript";
import {getRelativeModulePath, stripTsExt} from "path_utils";
import {Compiler} from "compiler";

/** класс, умеющий находить файлы исходников, в которых расположен модуль по ссылке на него */
export class ModulePathResolver {

	private readonly moduleRoot: string;
	private readonly ambientModules: Set<string>;

	constructor(tsconfigPath: string, compilerOpts: tsc.CompilerOptions, private readonly compiler: Compiler){
		this.moduleRoot = path.resolve(path.dirname(tsconfigPath), compilerOpts.rootDir || ".");
		let ambientMods = this.compiler.program.getTypeChecker().getAmbientModules().map(x => x.name.replace(/(?:^['"]|['"]$)/g, ""));
		this.ambientModules = new Set(ambientMods);
	}

	/** если moduleDesignator указывает на модуль-файл - получить правильное имя модуля; иначе оставить его как есть */ 
	resolveModuleDesignator(moduleDesignator: string, sourceFile: string): string {
		if(this.ambientModules.has(moduleDesignator)){
			return moduleDesignator;
		}

		let res = tsc.resolveModuleName(
			moduleDesignator, 
			sourceFile, 
			this.compiler.program.getCompilerOptions(), 
			this.compiler.compilerHost
		);
		
		if(res.resolvedModule){
			if(res.resolvedModule.isExternalLibraryImport){
				return moduleDesignator;
			} else {
				return this.getAbsoluteModulePath(stripTsExt(res.resolvedModule.resolvedFileName));
			}
		}

		// тут я уже не знаю, что это и зачем это. просто оставляем в том виде, в котором есть
		return moduleDesignator;
	}

	getAbsoluteModulePath(absPath: string): string {
		return "/" + getRelativeModulePath(this.moduleRoot, absPath);
	}

}