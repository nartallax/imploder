export class SeqSet<T extends string | number | boolean | null>{
	seq = [] as T[];
	private set = new Set<T>();

	push(v: T){
		if(this.set.has(v)){
			throw new Error("Could not add repeated value \"" + v + "\" to SeqSet.");
		}
		this.set.add(v);
		this.seq.push(v);
	}

	has(v: T){
		return this.set.has(v);
	}

	pop(): T {
		let res = this.seq.pop();
		if(res === undefined){
			throw new Error("SeqSet underflow.");
		}
		this.set.delete(res);
		return res;
	}
}