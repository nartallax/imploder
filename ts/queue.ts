export class Queue<T>{
	private head: QueueItem<T> | null = null;
	private tail: QueueItem<T> | null = null;

	isEmpty(): boolean {
		return this.head === null;
	}

	enqueue(value: T): void {
		if(!this.tail){
			this.head = this.tail = { value, next: null }
		} else {
			let newTail: QueueItem<T> = { value, next: null };
			this.tail.next = newTail;
			this.tail = newTail;
		}
	}

	dequeue(): T {
		if(!this.head){
			throw new Error("Invoked dequeue() on empty queue.");
		}

		let oldHead = this.head;
		this.head = oldHead.next;
		return oldHead.value;
	}
}

interface QueueItem<T>{
	value: T;
	next: QueueItem<T> | null;
}