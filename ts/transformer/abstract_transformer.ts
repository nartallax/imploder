import * as tsc from "typescript";
import {ModulePathResolver} from "module_path_resolver";
import {stripTsExt} from "path_utils";

export type TransformMappingResult = {recurse: boolean, result: tsc.Node | tsc.Node[]}

/** класс с утилитами для трансформеров */
export abstract class AbstractTransformer implements tsc.CustomTransformer {

	constructor(
		protected readonly context: tsc.TransformationContext,
		protected readonly resolver: ModulePathResolver
	){}

	public transformBundle(node: tsc.Bundle): tsc.Bundle {
		return node;
	}

	public transformSourceFile(fileNode: tsc.SourceFile): tsc.SourceFile {
		return fileNode;
	}

	protected transformVisitRecursive(node: tsc.Node, mapper: (src: tsc.Node, depth: number) => TransformMappingResult, currentDepth: number = 0): tsc.Node | tsc.Node[] {
		let mapped = mapper(node, currentDepth);
		if(!mapped.recurse){
			return mapped.result
		} else {
			if(Array.isArray(mapped.result)){
				let arr = mapped.result;
				for(let i = 0; i < arr.length; i++){
					arr[i] = tsc.visitEachChild(
						arr[i], 
						child => this.transformVisitRecursive(child, mapper, currentDepth + 1), 
						this.context
					);
				}
				return arr;
			} else {
				return tsc.visitEachChild(
					mapped.result, 
					child => this.transformVisitRecursive(child, mapper, currentDepth + 1), 
					this.context
				);
			}
		}
	}

	protected visitRecursive(node: tsc.Node, visitor: (node: tsc.Node, depth: number) => boolean | void, shouldFallThrough: ((node: tsc.Node) => boolean) | null = null, currentDepth: number = 0): boolean {
		let stopped = false;
		node.forEachChild(child => {
			if(stopped || visitor(child, currentDepth) === false){
				stopped = true;
				return;
			}
			
			if(shouldFallThrough && shouldFallThrough(child)){
				if(this.visitRecursive(child, visitor, shouldFallThrough, currentDepth + 1) === false){
					stopped = true;
					return;
				}
			}
		});
		return !stopped;
	}

	/** пройтись по AST файла и вывести его в консоль в каком-то виде
	* полезно при попытках понять, как же выглядит AST в конкретном случае */
	protected traverseDumpFileAst(fileNode: tsc.SourceFile): void {
		let prefix = fileNode.fileName;
		if(prefix.length > 30){
			prefix = "..." + prefix.substr(prefix.length - 30);
		}
		this.visitRecursive(fileNode, (node, depth) => {
			console.log(prefix + new Array(depth + 2).join("    ") + tsc.SyntaxKind[node.kind]);
		}, () => true)
	}

	protected moduleNameByNode(fileNode: tsc.SourceFile): string {
		return stripTsExt(this.resolver.getAbsoluteModulePath(fileNode.fileName));
	}

}