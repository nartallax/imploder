import {Queue} from "utils/queue"

export class Lock {
	private lockLevel = 0
	private waiters = new Queue<() => void>();

	isLocked(): boolean {
		return this.lockLevel > 0
	}

	lock(): void {
		this.lockLevel++;
	}

	unlock(): void{
		this.lockLevel--;
		if(this.lockLevel < 1 && !this.waiters.isEmpty()){
			this.lockLevel++;
			this.waiters.dequeue()();
		}
	}

	getLockLevel(): number {
		return this.lockLevel;
	}

	withLock<T>(action: () => (T | Promise<T>)): Promise<T> {
		return new Promise((ok, err) => {

			let executeAction = async () => {
				try {
					ok(await action());
				} catch(e){
					err(e);
				} finally {
					this.unlock();
				}
			}

			if(!this.isLocked()){
				this.lock();
				executeAction();
			} else {
				this.waiters.enqueue(executeAction);
			}
		});
	}


}