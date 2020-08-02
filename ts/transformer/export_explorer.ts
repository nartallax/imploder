import * as tsc from "typescript";
import {logErrorAndExit} from "log";
import {ModuleMeta} from "module_meta_storage";

/** обработать экспорты в файле модуля. результаты положить в moduleMeta */
export function processFileExports(fileNode: tsc.SourceFile, moduleMeta: ModuleMeta) {
	let children = fileNode.getChildren();
	if(children.length === 2 && children[0].kind === tsc.SyntaxKind.SyntaxList && children[1].kind === tsc.SyntaxKind.EndOfFileToken){
		children = children[0].getChildren();
	}
	for(let node of children){
		if(tsc.isFunctionDeclaration(node) || tsc.isClassDeclaration(node)){

			if(hasExportModifier(node)){
				if(!node.name){
					logErrorAndExit("Unexpected: exported node of type " + tsc.SyntaxKind[node.kind] + " have no name.");
				}
				if(hassDefaultModifier(node)){
					moduleMeta.exports.push("default");
				} else {
					moduleMeta.exports.push(node.name.text)
				}
				
			}
	
		} else if(node.kind === tsc.SyntaxKind.FirstStatement){
	
			// почему это называется FirstStatement? кто знает.
			// это нода с экспортом переменных и констант
			if(hasExportModifier(node)){
				for(let child of node.getChildren()){
					if(tsc.isVariableDeclarationList(child)){
						for(let decl of child.declarations){
							let name = decl.name;
							if(name.kind !== tsc.SyntaxKind.Identifier){
								logErrorAndExit("Unexpected: exported variable declaration name is not identifier.");
							}
							moduleMeta.exports.push(name.text);
						}
					}
				}
			}
	
		} else if(tsc.isModuleDeclaration(node)){

			// фактически - объявление namespace. module - это старый кейворд, делает то же, что и namespace
			if(hasExportModifier(node)){
				for(let child of node.getChildren()){
					if(tsc.isIdentifier(child)){
						moduleMeta.exports.push(child.text);
						break;
					}
				}
			}

		} else if(tsc.isExportDeclaration(node)){
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
}

export function hasExportModifier(node: tsc.Node): boolean {
	return !!node.modifiers && !!node.modifiers.find(_ => _.kind === tsc.SyntaxKind.ExportKeyword);
}

function hassDefaultModifier(node: tsc.Node): boolean {
	return !!node.modifiers && !!node.modifiers.find(_ => _.kind === tsc.SyntaxKind.DefaultKeyword);
}

/*
Неймспейс - это просто шугар для создания объекта
триплслеш:
reference path - модуль по path должен быть исполнен строго ранее включающего (резолвить относительно текущего файла)
amd-module name - модуль может быть доступен по альтернативному имени
amd-dependency path - модуль нужно включить в список зависимостей (перед остальными)

*/