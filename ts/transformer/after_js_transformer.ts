import {AbstractTransformer} from "./abstract_transformer";
import * as tsc from "typescript";
import {ModuleMetadataStorage, ModuleMeta} from "module_meta_storage";
import {ModulePathResolver} from "module_path_resolver";
import {stripTsExt} from "path_utils";
import {logWarn} from "log";

export class AfterJsBundlerTransformer extends AbstractTransformer {

	constructor(
		context: tsc.TransformationContext,
		private readonly metaStorage: ModuleMetadataStorage,
		resolver: ModulePathResolver){
		super(context, resolver);
	}

	transformSourceFile(fileNode: tsc.SourceFile): tsc.SourceFile {
		let moduleName = this.moduleNameByNode(fileNode);
		let moduleMeta = this.metaStorage.get(moduleName);
		
		let definingFunction: tsc.Node | null = null
		//this.traverseDumpFileAst(fileNode);

		this.visitRecursive(fileNode, node => {
			if(!tsc.isCallExpression(node) || !tsc.isIdentifier(node.expression) || node.expression.text !== "define" && !!definingFunction){
				// что-то делаем только на первом вызове define()
				return;
			}
				
			definingFunction = this.processDefineCall(moduleMeta, node, fileNode);

			return false;
		}, node => {
			// не пытаемся искать define() внутри других функций
			// это нужно, во-первых, для ускорения процесса (define() - всегда топ-левел вызов)
			// во-вторых, для уменьшения количества багов
			// конечно, всегда можно сделать не-модульный файл, в котором будет определена своя функция define, и вызывать её
			// но мне не хочется настолько сильно анализировать код здесь, так что скажем, что это маловероятно
			return !tsc.isFunctionExpression(node)
		});

		if(!definingFunction){
			if(moduleMeta.hasImportOrExport){
				throw new Error("Transformed code of module " + moduleName + " does not contain any define() invocations");
			} else {
				return fileNode;
			}
		}

		this.setImportExportFlag(moduleMeta, fileNode, moduleName);

		let result = tsc.getMutableClone(fileNode);
		result.statements = tsc.createNodeArray([definingFunction]);
		return result;
	}

	private setImportExportFlag(moduleMeta: ModuleMeta, fileNode: tsc.SourceFile, moduleName: string){
		moduleMeta.hasImportOrExport = moduleMeta.hasImportOrExport
			|| moduleMeta.exports.length > 0
			|| moduleMeta.hasOmniousExport
			|| moduleMeta.dependencies.length > 0
			|| moduleMeta.exportModuleReferences.length > 0;

		if(moduleMeta.hasImportOrExport){
			fileNode.amdDependencies.forEach(dep => {
				let path = this.resolver.resolveModuleDesignator(stripTsExt(dep.path), fileNode.fileName, true);
				moduleMeta.dependencies.push(path);
			});
		} else {
			if(fileNode.amdDependencies.length > 0){
				// интересно, зачем это вообще может пригодиться. но пусть будет
				logWarn("Source file " + moduleName + " has <amd-dependency>, but is not a module (does not exports or imports anything). Dependency information will be lost.");
			}
			if(moduleMeta.altName){
				logWarn("Source file " + moduleName + " has <amd-module>, but is not a module (does not exports or imports anything). Value of module name will be lost.");
			}
		}
	}

	private processDefineCall(moduleMeta: ModuleMeta, defineCallNode: tsc.CallExpression, fileNode: tsc.SourceFile): tsc.Node {
		let depArrNode = defineCallNode.arguments[defineCallNode.arguments.length - 2];
		if(!tsc.isArrayLiteralExpression(depArrNode)){
			throw new Error("Second-from-end argument of define() is not array literal.");
		}

		let rawDependencies = depArrNode.elements.map(el => {
			if(!tsc.isStringLiteral(el)){
				throw new Error("Second-from-end argument of define() is not string literal array.");
			}
			return el.text;
		}).filter(x => x !== "exports" && x !== "require")

		moduleMeta.dependencies = rawDependencies.map(x => this.resolver.resolveModuleDesignator(x, fileNode.fileName))

		let defFuncArg = defineCallNode.arguments[defineCallNode.arguments.length - 1];
		if(!tsc.isFunctionExpression(defFuncArg)){
			throw new Error("First-from-end argument of define() is not function expression.");
		}

		let moduleBodyStatements = defFuncArg.body.statements;
		let startWith = 0;
		let firstMeaninfulStatementReached = false;

		// тут мы выкидываем кучу всякой ненужной сгенерированной фигни с начала тела модуля
		// часть из этой фигни мы допишем в лоадере, когда будем собирать эвал-код
		// другая часть нужна просто для соответствия стандартам и интеропом между бандлерами, и нам не интересна вообще
		for(let i = 0; i < moduleBodyStatements.length; i++){
			let statement = moduleBodyStatements[i];
			if(!tsc.isExpressionStatement(statement)){
				// не уверен, какой statement не является expression. ну да ладно
				firstMeaninfulStatementReached = true;
				continue;
			}

			let expr = statement.expression;

			if(!firstMeaninfulStatementReached){
				if(tsc.isStringLiteral(expr) && expr.text === "use strict"){
					startWith = i + 1;
					continue;
				}
				
				if(this.isExportAssignment(expr)){
					let exportName = this.getExportAssignmentName(expr);
					if(exportName === "__esModule"){
						startWith = i + 1;
						continue;
					}
				}

				// скипаем перечисление экспортов вида exports.someItem = void 0;
				// оно автоматически генерируется для соответствия чему-то там, не помню
				// тут иногда случается двойная проверка на isExportAssignment, не очень красиво
				// впрочем, я не уверен, что компилятор не будет схлопывать несколько присвоений void 0 в одно
				// даже если это не относится к экспортам. а не относящееся к экспортам присвоение скипать не надо
				// поэтому лучше проверить всю цепочку
				if(this.isVoidExportAssignmentChain(expr, moduleMeta.exports)){
					startWith = i + 1;
					continue;
				}

				if(tsc.isCallExpression(expr)){
					let c: tsc.CallExpression = expr;
					let ce = c.expression;
					let args = c.arguments;
					if(args.length > 1){
						let argA = args[0];
						let argB = args[1];
						if(tsc.isPropertyAccessExpression(ce) 
							&& tsc.isIdentifier(ce.expression) && ce.expression.text === "Object"
							&& tsc.isIdentifier(ce.name) && ce.name.text === "defineProperty"
							&& tsc.isIdentifier(argA) && argA.text === "exports"
							&& tsc.isStringLiteral(argB) && argB.text === "__esModule"){
								startWith = i + 1;
								continue;
						}
					}
				}

				firstMeaninfulStatementReached = true;
			}

			if(this.isExportAssignment(expr)){
				moduleMeta.exports.push(this.getExportAssignmentName(expr));
			}
		}

		moduleMeta.exports = [...new Set(moduleMeta.exports)];
		let resultBodyStatements = moduleBodyStatements.slice(startWith);
		let result = tsc.getMutableClone(defFuncArg);
		let resultBody = result.body = tsc.getMutableClone(result.body);
		resultBody.statements = tsc.createNodeArray(resultBodyStatements);
		
		// переставляем exports и require в самое начало списка параметров
		// нужно, чтобы не перечислять их в списке зависимостей и просто знать, что они всегда идут сначала
		let params = [...result.parameters];
		params = params.filter(x => !tsc.isIdentifier(x.name) || (x.name.text !== "exports" && x.name.text !== "require"))
		params = [
			tsc.createParameter(undefined, undefined, undefined, "exports"),
			tsc.createParameter(undefined, undefined, undefined, "require"),
			...params
		]
		result.parameters = tsc.createNodeArray(params);
		
		return result;
	}

	// узнать, является ли это выражение присвоением вида exports.value = void 0;
	// иногда компилятор схлопывает несколько деклараций в цепочку вида exports.a = exports.b = ... = void 0;
	// эта цепочка тут тоже детектится
	private isVoidExportAssignmentChain(expr: tsc.Expression, exportedNames: string[]): boolean {
		if(!this.isExportAssignment(expr)){
			return false;
		}
		exportedNames.push(this.getExportAssignmentName(expr));
		if(tsc.isVoidExpression(expr.right)){
			return true;
		} else {
			return this.isVoidExportAssignmentChain(expr.right, exportedNames);
		}
	}

	private isExportAssignment(node: tsc.Node): node is (tsc.BinaryExpression & {left: tsc.PropertyAccessExpression}) {
		if(tsc.isBinaryExpression(node) 
			&& tsc.isPropertyAccessExpression(node.left) 
			&& tsc.isIdentifierOrPrivateIdentifier(node.left.expression)
			&& node.left.expression.text === "exports"){
			return true
		}
		return false;
	}

	private getExportAssignmentName(node: (tsc.BinaryExpression & {left: tsc.PropertyAccessExpression})): string {
		return node.left.name.text;
	}



}