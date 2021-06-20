import {Imploder} from "../../target/imploder";
import * as tsc from "typescript";

type VisitResult = false | void | undefined | tsc.Node | tsc.Node[];

interface TransformerParams {
	functionName?: string;
}

let transformVisitRecursive = <T extends tsc.Node>(node: T, context: tsc.TransformationContext, visitor: (node: tsc.Node) => VisitResult): T => {

	let wrappedVisitor = (node: tsc.Node) => {
		let res = visitor(node);
		if(res === false){ // false = ничего не меняем, но и дальше по этой ветке не идем
			return node;
		}
		if(res !== undefined){ // нода/ноды = вот результат трансформации, дальше по этой ветке идти не надо
			return res;
		}
		// undefined = мы пока не нашли того, что ищем, продолжаем
		return tsc.visitEachChild(node, wrappedVisitor, context);
	
	}

	return tsc.visitEachChild(node, wrappedVisitor, context);
}

export function main(toolContext: Imploder.Context, params?: TransformerParams) {
	return (transformContext: tsc.TransformationContext) => (file: tsc.SourceFile)=> {
		let moduleName = toolContext.modulePathResolver.getCanonicalModuleName(file.fileName);
		if(moduleName === "/utils"){
			//console.error("Skipping file: " + file.fileName);
			return file;
		}

		let shouldAddImport = false;

		let result = transformVisitRecursive(file, transformContext, node => {
			if(tsc.isCallExpression(node) && 
				tsc.isPropertyAccessExpression(node.expression) &&
				node.expression.name.text === "log" &&
				tsc.isIdentifier(node.expression.expression) &&
				node.expression.expression.text === "console"){

				shouldAddImport = true;
				return tsc.factory.updateCallExpression(node,
					tsc.factory.createPropertyAccessExpression(
						tsc.factory.createIdentifier("utilModule123321"),
						tsc.factory.createIdentifier(params?.functionName || "logText")
					),
					node.typeArguments,
					node.arguments
				)
			}
		});
		
		if(shouldAddImport){
			result = tsc.factory.updateSourceFile(result,
				[
					tsc.factory.createImportDeclaration(undefined, undefined, 
						tsc.factory.createImportClause(false, 
							undefined,
							tsc.factory.createNamespaceImport(
								tsc.factory.createIdentifier("utilModule123321")
							)
						),
						tsc.factory.createStringLiteral("utils")
					),
					
					...result.statements
				]
			);
		}

		return result;
	}
}