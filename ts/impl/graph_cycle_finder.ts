interface GraphNode {
	inCount: number
	outCount: number
	in: string[]
	out: string[]
}

/** Найти в ориентированном графе все ноды, которые участвуют в каких-либо циклах в графе
 * @param sourceGraph описание исходного графа в виде id ноды -> id нод, на которые эта нода ссылается
 * Подразумевается, что id нод не повторяются в пределах одного массива
 *
 * Общая идея алгоритма: в циклы не входят ноды, у которых нет исходящих либо входящих ссылок
 * Поэтому мы собираем для каждой ноды входящие и исходящие ссылки
 * Затем находим ноды, у которых количество каких-либо ссылок равно нулю, и удаляем их
 * При удалении декрементируем счетчики у нод, на которые эта нода ссылается, или которые ссылаются на эту ноду
 * Если счетчик при декрементировании обнулился - то эту ноду тоже удаляем, рекурсивно
 * В итоге в списке нод остаются только ноды, участвующие в циклах
 */
export function findAllCycledNodesInGraph(sourceGraph: [string, string[]][]): string[] {
	let nodes: Map<string, GraphNode> = new Map(sourceGraph.map(([id, out]) => [
		id, {
			inCount: 0,
			in: [],
			// тут мы не можем сразу сказать out.length,
			// потому что часть нод из out может не существовать
			// мы их потом посчитаем
			outCount: 0,
			out: out
		}
	]))

	sourceGraph.forEach(([id, out]) => {
		let node = nodes.get(id)!
		out.forEach(outId => {
			let inNode = nodes.get(outId)
			if(inNode){
				node.outCount++
				inNode.inCount++
				inNode.in.push(id)
			}
		})
	})

	function removeNode(id: string, node: GraphNode): void {
		nodes.delete(id)
		node.out.forEach(outId => {
			let inNode = nodes.get(outId)
			if(inNode){
				inNode.inCount--
				if(inNode.inCount === 0){
					removeNode(outId, inNode)
				}
			}
		})
		node.in.forEach(inId => {
			let outNode = nodes.get(inId)
			if(outNode){
				outNode.outCount--
				if(outNode.outCount === 0){
					removeNode(inId, outNode)
				}
			}
		})
	}

	for(let [id] of sourceGraph){
		let node = nodes.get(id)
		if(node && (node.outCount === 0 || node.inCount === 0)){
			removeNode(id, node)
		}
	}

	return [...nodes.keys()]
}