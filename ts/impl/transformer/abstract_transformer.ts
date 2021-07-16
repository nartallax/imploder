import * as Tsc from "typescript";
import {Imploder} from "imploder";

export type TransformMappingResult = {recurse: boolean, result: Tsc.Node | Tsc.Node[]}

/** класс с утилитами для трансформеров */
export abstract class AbstractTransformer implements Tsc.CustomTransformer {

	constructor(
		protected readonly transformContext: Tsc.TransformationContext,
		protected readonly context: Imploder.Context
	){}

	public transformBundle(node: Tsc.Bundle): Tsc.Bundle {
		return node;
	}

	public transformSourceFile(fileNode: Tsc.SourceFile): Tsc.SourceFile {
		return fileNode;
	}

	protected transformVisitRecursive(node: Tsc.Node, mapper: (src: Tsc.Node, depth: number) => TransformMappingResult, currentDepth = 0): Tsc.Node | Tsc.Node[] {
		let mapped = mapper(node, currentDepth);
		if(!mapped.recurse){
			return mapped.result
		} else {
			if(Array.isArray(mapped.result)){
				let arr = mapped.result;
				for(let i = 0; i < arr.length; i++){
					arr[i] = Tsc.visitEachChild(
						arr[i], 
						child => this.transformVisitRecursive(child, mapper, currentDepth + 1), 
						this.transformContext
					);
				}
				return arr;
			} else {
				return Tsc.visitEachChild(
					mapped.result, 
					child => this.transformVisitRecursive(child, mapper, currentDepth + 1), 
					this.transformContext
				);
			}
		}
	}

	protected visitRecursive(node: Tsc.Node, visitor: (node: Tsc.Node, depth: number, index: number) => boolean | void, shouldFallThrough: ((node: Tsc.Node) => boolean) | null = null, currentDepth = 0): boolean {
		let stopped = false;
		let index = -1;
		node.forEachChild(child => {
			index++;
			if(stopped || visitor(child, currentDepth, index) === false){
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
	protected traverseDumpFileAst(fileNode: Tsc.SourceFile): void {
		let prefix = fileNode.fileName;
		if(prefix.length > 30){
			prefix = "..." + prefix.substr(prefix.length - 30);
		}
		this.visitRecursive(fileNode, (node, depth, index) => {
			let text = "<unknown>";
			try {
				text = node.getText() || "";
			} catch(e: unknown){
				text = "<err: " + (e as Error).message + ">"
			}

			text = text.replace(/[\n\r\s\t]/g, " ");
			if(text.length > 30){
				text = text.substr(0, 30) + "...";
			}
			console.log(prefix + " " + index + " " + new Array(depth + 2).join("  ") + Tsc.SyntaxKind[node.kind] + ": " + text);
		}, () => true)
	}

	protected moduleNameByNode(fileNode: Tsc.SourceFile): string {
		return this.context.modulePathResolver.getCanonicalModuleName(fileNode.fileName);
	}

}