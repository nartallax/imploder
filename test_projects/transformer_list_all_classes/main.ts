import * as tsc from "typescript";
import * as fs from "fs";
import * as path from "path";
import {Imploder} from "../../target/imploder";

let haveDiffsInSets = <T>(oldValues: Set<T> | undefined, newValues: Set<T>): boolean => {
	if(!oldValues){
		return newValues.size !== 0
	}

	if(!newValues){
		if(!oldValues || oldValues.size === 0){
			return false;
		}
		return true;
	}
	
	if(oldValues.size !== newValues.size){
		return true;
	}

	for(let v of newValues){
		if(!oldValues.has(v)){
			return true;
		}
	}
	for(let v of oldValues){
		if(!newValues.has(v)){
			return true;
		}
	}

	return false;
}

class ClassEnumeratorTransformer {
	private readonly knownClasses = new Map<string, Set<string>>(); // module name -> class names
	private readonly generatedFilePath: string;

	constructor(private readonly toolContext: Imploder.Context){
		this.generatedFilePath = path.resolve(path.dirname(this.toolContext.config.tsconfigPath), "generated.ts");
	}

	static makeInstance(toolContext: Imploder.Context): Imploder.CustomTransformerFactory {
		let factory = new ClassEnumeratorTransformer(toolContext);
		let result: Imploder.CustomTransformerFactory = (_: tsc.TransformationContext) => factory.createInstance()
		result.onModuleDelete = factory.onModuleDelete.bind(factory);
		return result;
	}

	onModuleDelete(moduleName: string) {
		this.updateClasses(moduleName, null);
	}

	createInstance(): (file: tsc.SourceFile) => tsc.SourceFile {

		let visitRecursive = (node: tsc.Node, handler: (node: tsc.Node) => void | undefined | boolean, depth: number = 0): void => {
			//console.error(new Array(depth + 1).join("  ") + tsc.SyntaxKind[node.kind]);
			let result = handler(node);
			if(result !== false){
				node.forEachChild(child => {
					visitRecursive(child, handler, depth + 1);
				});
			}
		}

		return file => {
			if(file.fileName === this.generatedFilePath){
				//console.error("Skipping generated file: " + file.fileName);
				return file;
			}

			//console.error("Visiting " + file.fileName);
			let moduleName = this.toolContext.modulePathResolver.getCanonicalModuleName(file.fileName);

			let classNames = [] as string[];

			visitRecursive(file, node => {
				if(tsc.isNamespaceExport(node) || tsc.isNamespaceExportDeclaration(node) || tsc.isModuleDeclaration(node)){
					// скипаем все namespace
					// внутри namespace могут быть экспортируемые классы, но нам они не интересны
					// ModuleDeclaration - это старое название неймспейса
					return false;
				}

				if(this.isTargetClassDecl(node)){
					classNames.push(node.name.getText());
					return false;
				}
			})

			//console.error("Found " + classNames);

			this.updateClasses(moduleName, classNames);

			return file;
		}
	}

	private isTargetClassDecl(node: tsc.Node): node is tsc.ClassDeclaration {
		// нас интересуют только определения классов
		if(!tsc.isClassDeclaration(node)){
			return false;
		}

		// нас интересуют только инстанциируемые классы; абстрактные пропускаем
		if(node.modifiers && node.modifiers.find(_ => _.kind === tsc.SyntaxKind.AbstractKeyword)){
			return false;
		}

		// нас не интересуют внутрение классы модуля; только экспортируемые
		if(!node.modifiers || !node.modifiers.find(_ => _.kind === tsc.SyntaxKind.ExportKeyword)){
			return false;
		}

		if(this.classOrInterfaceImplementsInterface(node, "SomeInterface", this.toolContext.compiler.program.getTypeChecker())){
			//console.error("Found target class: " + node.name.getText() + " in module " + moduleName);
			return true;
		}
	}

	private classOrInterfaceImplementsInterface(cls: tsc.ClassDeclaration | tsc.InterfaceDeclaration, interfaceName: string, typeChecker: tsc.TypeChecker): boolean {
		for(let clause of (cls.heritageClauses || [])){
			for(let type of clause.types){
				let t = typeChecker.getTypeAtLocation(type.expression);
				if(t.isClassOrInterface()){
					for(let decl of t.getSymbol().getDeclarations()){
						if(tsc.isInterfaceDeclaration(decl)){
							if(decl.name.getText() === interfaceName){
								return true;
							}
							if(this.classOrInterfaceImplementsInterface(decl, interfaceName, typeChecker)){
								return true;
							}
						} else if(tsc.isClassDeclaration(decl)){
							if(this.classOrInterfaceImplementsInterface(decl, interfaceName, typeChecker)){
								return true;
							}
						}
					}
				} else if(t.symbol && t.symbol.valueDeclaration && tsc.isClassDeclaration(t.symbol.valueDeclaration)){
					// почему классы идут сюда, а не выше? понятия не имею
					if(this.classOrInterfaceImplementsInterface(t.symbol.valueDeclaration, interfaceName, typeChecker)){
						return true;
					}
				}
			}
		}
		
		return false;
	}

	private updateClasses(moduleName: string, classNames: string[] | null): void {
		let oldClassNames = this.knownClasses.get(moduleName);
		let newClassNames = new Set(classNames || []);

		if(haveDiffsInSets(oldClassNames, newClassNames)){
			//console.error("Have diffs in " + moduleName + ": ", oldClassNames, newClassNames);
			if(newClassNames.size > 0){
				this.knownClasses.set(moduleName, newClassNames);
			} else {
				this.knownClasses.delete(moduleName);
			}
			this.generateFile();
		}
		
	}

	private generateFile(){
		let imports = [] as string[];
		let exports = [] as string[];
		let index = 0;
		[...this.knownClasses.keys()].sort().forEach(moduleName => {
			let clauses = [] as string[];
			[...(this.knownClasses.get(moduleName) as Set<string>)].sort().forEach(className => {
				let name = "_" + index;
				clauses.push(className + " as " + name);
				exports.push(name);
				index++;
			});
			imports.push(`import {${clauses.join(", ")}} from "${moduleName}";`);
		});
		imports.push(`import {SomeInterface} from "main";`)

		let fileText = `${imports.join("\n")}\n\nexport const myClassEnumeration: ReadonlyArray<{new(): SomeInterface}> = [${exports.join(", ")}];`

		
		fs.writeFileSync(this.generatedFilePath, fileText, "utf8");
		this.toolContext.compiler.notifyFsObjectChange(this.generatedFilePath);
	}

}

export function main(toolContext: Imploder.Context) {
	return ClassEnumeratorTransformer.makeInstance(toolContext);
}