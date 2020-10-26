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
		if(!this.waiters.isEmpty()){
			this.waiters.dequeue()();
		} else {
			this.lockLevel--;
		}
	}

	getLockLevel(): number {
		return this.lockLevel;
	}

	withLock<T>(action: () => (T | Promise<T>)): Promise<T> {
		return new Promise(async (ok, err) => {

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