import * as tsc from "typescript";
import {logDebug, logErrorAndExit, logWarn} from "utils/log";
import {ModuleData} from "impl/module_storage";
import {AbstractTransformer} from "./abstract_transformer";

export class BeforeJsBundlerTransformer extends AbstractTransformer {

	transformSourceFile(fileNode: tsc.SourceFile): tsc.SourceFile {
		let moduleName = this.moduleNameByNode(fileNode);
		logDebug("Visiting " + this.context.modulePathResolver.getCanonicalModuleName(fileNode.fileName) + " as module " + moduleName)

		let meta: ModuleData = {
			dependencies: [],
			exportModuleReferences: [],
			exports: [],
			hasOmniousExport: false,
			altName: null,
			jsCode: null,
			hasImportOrExport: false
		}

		if(fileNode.referencedFiles.length > 0){
			logWarn("File " + moduleName + " references some other files. They will not be included in bundle.");
		}
		
		if(fileNode.moduleName){
			meta.altName = fileNode.moduleName;
		}

		this.exploreSpecialExports(meta, fileNode);
		this.context.moduleStorage.set(moduleName, meta);

		return fileNode;
	}

	/** проанализировать экспорты в файле, положить результаты анализа в moduleMeta
	* эта функция обрабатывает только export = и export from
	* остальные экспорты проще обрабатывать после трансформации js */
	private exploreSpecialExports(moduleMeta: ModuleData, fileNode: tsc.SourceFile) {
		/*
		технически, все экспортируемые имена могут быть получены с помощью нижеуказанного кода
		но это не очень хорошо работает по двум причинам
		1. export * from "othermodule" разворачивается в просто список имен, что не дает проанализировать структуру модулей
		2. export = { ... } никак не появляется в списке экспортов
		3. ... возможно, еще какие-то проблемы, которые я не обнаружил сходу
		короче, надежнее пройтись по дереву вручную

		let checker = this.program.getTypeChecker();
		let symbol = checker.getSymbolAtLocation(fileNode)
		if(symbol){
			let exports = checker.getExportsOfModule(symbol);
			exports.forEach(ex => {
				console.log("export of module " + moduleName + " is " + ex.name)
			})
		}
		*/

		let children = fileNode.getChildren();
		if(children.length === 2 && children[0].kind === tsc.SyntaxKind.SyntaxList && children[1].kind === tsc.SyntaxKind.EndOfFileToken){
			children = children[0].getChildren();
		}
		for(let node of children){
			if(tsc.isExportDeclaration(node)){
				if(!node.exportClause){
					// такое может быть только в случае export * from "..."
					if(!node.moduleSpecifier || !tsc.isStringLiteral(node.moduleSpecifier)){
						logErrorAndExit("Unexpected: \"export * from\" construction has no module specifier (or is not string literal).");
					}
					moduleMeta.exportModuleReferences.push(node.moduleSpecifier.text);
				} else {
					let exportClause = node.exportClause;
					if(tsc.isNamedExports(exportClause)){
						for(let exportElement of exportClause.elements){
							// exportElement.propertyName - это имя изначально экспортируемого значения, до переименования
							// в случае export { privateLibConst as someLibConst }; - это privateLibConst
							moduleMeta.exports.push(exportElement.name.text);
						}
					} else {
						// на самом деле, тут можно было бы обрабатывать, но я пока не уверен, что именно это такое
						// поэтому пока не буду
						throw new Error("Export declaration is not consists of named elements.");
					}
				}
		
			} else if(tsc.isExportAssignment(node)){
				// тут есть два варианта - либо это "export = ", либо "export default"
				// export default просто создает в экспорте значение с именем default
				// export = в итоге станет return-statement в определении модуля
				if(!node.isExportEquals){
					moduleMeta.exports.push("default");
				} else {
					// в такой ситуации мы ничего не можем сказать об экспортируемом множестве имен
					// ибо они могут быть переменными, их вообще может не быть (если таким образом экспортировано просто одно число, например), и т.д.
					moduleMeta.hasOmniousExport = true;
				}
		
			}
		}

		moduleMeta.exportModuleReferences = [... new Set(
			moduleMeta.exportModuleReferences.map(x => this.context.modulePathResolver.resolveModuleDesignator(x, fileNode.fileName))
		)];
	}

}