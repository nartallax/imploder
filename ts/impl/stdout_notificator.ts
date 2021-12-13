import {Imploder} from "imploder";

export class StdoutNotificatorImpl implements Imploder.StdoutNotificator {

	constructor(private readonly context: Imploder.Context){}

	private notify(notification: Imploder.StdoutNotification): void {
		if(!this.context.config.stdoutNotifications){
			return;
		}
		process.stdout.write(JSON.stringify(notification) + "\n")
	}

	started(): void {
		this.notify({type: "started"})
	}

}