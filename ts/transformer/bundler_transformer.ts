import * as tsc from "typescript";
import {ModulePathResolver} from "./module_path_resolver";
import {logDebug, logErrorAndExit, logWarn} from "log";
import {ModuleMetadataStorage, ModuleMeta} from "module_meta_storage";
import {stripTsExt, isTsExt} from "path_utils";
import {visitNodeRecursive} from "./transformer_utils";
import {processFileExports} from "./export_explorer";

/**
 * Трансформер, делающий всякие штуки, которые нужны бандлеру.
 * Заполняет переданный экземпляр ModuleMetadataStorage данными.
 * Приводит все зависимости к единому виду. Нужно для упрощения резолва зависимостей в рантайме
 * source (largely altered): https://github.com/grrowl/ts-transformer-imports/ 
 * Результат, к которому приводятся ссылки на зависимости: путь в таком виде, в каком он есть в outDir
 * Учитывает paths, rootDir и rootDirs
 * Пути к модулям-файлам начинаются с /;
 * Это нужно затем, чтобы в рантайме можно было отличить ./fs (файл-модуль с кодом) от fs (встроенный модуль node) (например)
 */
export class BundlerTransformer implements tsc.CustomTransformer {

	constructor(
		private readonly context: tsc.TransformationContext,
		private readonly metaStorage: ModuleMetadataStorage,
		private readonly resolver: ModulePathResolver){
	}

	transformBundle(node: tsc.Bundle): tsc.Bundle {
		// понятия не имею, что это. пока что просто не будем их обрабатывать
		return node;
	}

	transformSourceFile(fileNode: tsc.SourceFile): tsc.SourceFile {
		let moduleName = stripTsExt(this.resolver.getAbsoluteModulePath(fileNode.fileName));
		logDebug("Visiting " + this.resolver.getAbsoluteModulePath(fileNode.fileName) + " as module " + moduleName)

		let meta: ModuleMeta = {
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

		//this.traverseDumpFileAst(fileNode);

		// TODO: не траверсить по всему AST, интересующие нас ноды должны лежать на поверхности
		// (кроме разве что асинхронных импортов)
		let result = visitNodeRecursive(fileNode, this.context, node => {
			// в этой функции иногда результат возвращается через result, а иногда сразу через return
			// возврат через result нужен для выставления флага
			let result: tsc.Node;
			if(tsc.isImportEqualsDeclaration(node)){
				result = this.fixImportEqualsNode(fileNode, node);
			} else if(tsc.isImportDeclaration(node) || tsc.isExportDeclaration(node)){
				result = this.fixImportExportNode(fileNode, node);
			} else if(tsc.isCallExpression(node) && node.expression.kind === tsc.SyntaxKind.ImportKeyword){
				// возможно, динамические импорты возможны и из не-модульных файлов?
				// не уверен. пусть пока будет так.
				result = this.fixDynamicImportNode(fileNode, node);
			} else {
				return node;
			}
			meta.hasImportOrExport = true;
			return result;
		}) as tsc.SourceFile;

		this.exploreExports(meta, fileNode);
		this.metaStorage.set(moduleName, meta);

		if(meta.hasImportOrExport){
			fileNode.amdDependencies.forEach(dep => {
				let path = this.fixModulePath(stripTsExt(dep.path), fileNode, true);
				meta.dependencies.push(path);
			});
		} else {
			if(fileNode.amdDependencies.length > 0){
				// интересно, зачем это вообще может пригодиться. но пусть будет
				logWarn("Source file " + moduleName + " has <amd-dependency>, but is not a module (does not exports or imports anything). Dependency information will be lost.");
			}
			if(meta.altName){
				logWarn("Source file " + moduleName + " has <amd-module>, but is not a module (does not exports or imports anything). Value of module name will be lost.");
			}
		}

		//console.log(moduleName, meta);

		return result;
	}

	private fixModulePath(sourceModulePath: string, fileNode: tsc.SourceFile, isKnownPath: boolean = false): string {
		let resultModulePath = this.resolver.getRootdirRelativePath(sourceModulePath, fileNode.fileName, isKnownPath);
		logDebug("Resolved module path " + sourceModulePath + " to " + resultModulePath + " (is known path = " + isKnownPath + ")");
		
		return resultModulePath || sourceModulePath;
	}

	private fixDynamicImportNode(fileNode: tsc.SourceFile, node: tsc.CallExpression): tsc.Node {
		if(node.arguments.length !== 1){
			logWarn("Dynamic import expession has " + node.arguments.length + " argument(s), expected exactly one.");
			return node;
		}

		let arg = node.arguments[0];
		if(!tsc.isStringLiteral(arg)){
			logWarn("Dynamic import expession has argument that is not string literal as first argument.");
			return node;
		}
		let modulePath = arg.text;

		let isPath = isTsExt(modulePath)
		if(isPath){
			modulePath = stripTsExt(modulePath);
		}

		return this.fixRewriteNode(fileNode, node, modulePath, (node, path) => {
			node.arguments = tsc.createNodeArray([ tsc.createStringLiteral(path) ]);
		}, isPath);
	}

	private fixImportExportNode(fileNode: tsc.SourceFile, node: tsc.ImportDeclaration | tsc.ExportDeclaration): tsc.Node {
		let modulePath = getNodeModulePath(node);
		if(!modulePath)
			return node;

			/*
		if(tsc.isImportDeclaration(node)){
			if(node.importClause){
				console.log("Import of module " + modulePath + " typeonly = " + node.importClause.isTypeOnly);
			}
		}
		*/

		return this.fixRewriteNode(fileNode, node, modulePath, (mutNode, resultModulePath) => {
			mutNode.moduleSpecifier = tsc.createStringLiteral(resultModulePath);
		});
	}

	private fixImportEqualsNode(fileNode: tsc.SourceFile, node: tsc.ImportEqualsDeclaration): tsc.Node {
		if(!tsc.isExternalModuleReference(node.moduleReference)){
			// мне интересно было бы в таком случае посмотреть, что это вообще за хрень такая
			logErrorAndExit("Unexpected: \"import = \" target is not module reference.")
		}

		// тут мы точно знаем, что у нас выражение имеет вид import someName = require(...)
		// это, конечно, балансирует на грани с let someName = require(...)
		// но последнее, во-первых, не типобезопасно
		// во-вторых, никак отследить вменяемо не получится. так что здесь я провожу грань
		// (в смысле, let someName = require(...) - не поддерживается бандлером, этот модуль придется доставлять отдельно)
		if(!tsc.isStringLiteral(node.moduleReference.expression)){
			logWarn("In file " + fileNode.fileName + ", \"import = \" is using non-constant reference name. This could lead to errors.");
			return node;
		}

		let modulePath = node.moduleReference.expression.text;
		return this.fixRewriteNode(fileNode, node, modulePath, (mutNode, resultModulePath) => {
			mutNode.moduleReference = tsc.createExternalModuleReference(tsc.createStringLiteral(resultModulePath));
		});
	}

	private fixRewriteNode<T extends tsc.Node>(fileNode: tsc.SourceFile, node: T, modulePath: string, mutate: (node: T, v: string) => void, isKnownPath: boolean = false): tsc.Node {
		let resultModulePath = this.fixModulePath(modulePath, fileNode, isKnownPath);
		
		if(resultModulePath === modulePath){
			return node; // можно не переписывать
		}

		let mutNode = tsc.getMutableClone(node);
		mutate(mutNode, resultModulePath);
		return mutNode;
	}

	private exploreExports(meta: ModuleMeta, fileNode: tsc.SourceFile) {
		/*
		технически, все экспортируемые имена могут быть получены с помощью нижеуказанного кода
		но это не очень хорошо работает по двум причинам
		1. export * from "othermodule" разворачивается в просто список имен, что не дает проанализировать структуру модулей
		2. export = { ... } никак не появляется в списке экспортов
		3. ... возможно, еще какие-то проблемы, которые я пока не обнаружил
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

		processFileExports(fileNode, meta);

		meta.exportModuleReferences = [... new Set(
			meta.exportModuleReferences.map(x => this.fixModulePath(x, fileNode))
		)];
	}
	
	/** пройтись по AST файла и вывести его в консоль в каком-то виде
	* полезно при попытках понять, как же выглядит AST в конкретном случае */
	protected traverseDumpFileAst(fileNode: tsc.SourceFile): void {
		let prefix = fileNode.fileName;
		if(prefix.length > 30){
			prefix = "..." + prefix.substr(prefix.length - 30);
		}
		visitNodeRecursive(fileNode, this.context, (node, depth) => {
			console.log(prefix + new Array(depth + 2).join("    ") + tsc.SyntaxKind[node.kind]);
			return node;
		})
   }

}

function getNodeModulePath(node: tsc.ImportDeclaration | tsc.ExportDeclaration): string | null {
	return node.moduleSpecifier? getModuleSpecifierValue(node.moduleSpecifier): null;
}

function getModuleSpecifierValue(specifier: tsc.Expression): string {
	// it's hard, so we'll just assume leading width is the length of the trailing width
	let leadingWidth = specifier.getLeadingTriviaWidth()
	// я понятия не имею, что за getLeadingTriviaWidth, поэтому просто оставлю этот код как есть
	// вроде бы и с ним все нормально работает
	const value = specifier.getText().substr(leadingWidth, specifier.getWidth() - (leadingWidth * 2));
	return value;
}

