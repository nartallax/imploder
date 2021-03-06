import * as tsc from "typescript";
import {Imploder} from "imploder";

export type TransformMappingResult = {recurse: boolean, result: tsc.Node | tsc.Node[]}

/** класс с утилитами для трансформеров */
export abstract class AbstractTransformer implements tsc.CustomTransformer {

	constructor(
		protected readonly transformContext: tsc.TransformationContext,
		protected readonly context: Imploder.Context
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
						this.transformContext
					);
				}
				return arr;
			} else {
				return tsc.visitEachChild(
					mapped.result, 
					child => this.transformVisitRecursive(child, mapper, currentDepth + 1), 
					this.transformContext
				);
			}
		}
	}

	protected visitRecursive(node: tsc.Node, visitor: (node: tsc.Node, depth: number, index: number) => boolean | void, shouldFallThrough: ((node: tsc.Node) => boolean) | null = null, currentDepth: number = 0): boolean {
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
	protected traverseDumpFileAst(fileNode: tsc.SourceFile): void {
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
			console.log(prefix + " " + index + " " + new Array(depth + 2).join("  ") + tsc.SyntaxKind[node.kind] + ": " + text);
		}, () => true)
	}

	protected moduleNameByNode(fileNode: tsc.SourceFile): string {
		return this.context.modulePathResolver.getCanonicalModuleName(fileNode.fileName);
	}

}