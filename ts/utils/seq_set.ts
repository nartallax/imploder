export class SeqSet<T> {
	seq = [] as T[]
	private set = new Set<string>()

	constructor(
		private readonly getKey: (value: T) => string = value => value + "",
		private readonly throwOnDuplicate: boolean = false
	) {}

	push(v: T): boolean {
		let k = this.getKey(v)
		if(this.set.has(k)){
			if(this.throwOnDuplicate){
				throw new Error("Could not add repeated value \"" + v + "\" to SeqSet.")
			} else {
				return false
			}
		}
		this.set.add(k)
		this.seq.push(v)
		return true
	}

	has(v: T): boolean {
		return this.set.has(this.getKey(v))
	}

	pop(): T {
		let res = this.seq.pop()
		if(res === undefined){
			throw new Error("SeqSet underflow.")
		}
		this.set.delete(this.getKey(res))
		return res
	}

	clear(): void {
		this.seq.length = 0
		this.set.clear()
	}
}