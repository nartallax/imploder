import * as tsc from "typescript";

export function visitNodeRecursive(node: tsc.Node, context: tsc.TransformationContext, mapper: (src: tsc.Node, depth: number) => tsc.Node, currentDepth: number = 0): tsc.Node {
	return tsc.visitEachChild(mapper(node, currentDepth), child => visitNodeRecursive(child, context, mapper, currentDepth + 1), context);
}