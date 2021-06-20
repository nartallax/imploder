import {Imploder} from "imploder";
import * as Http from "http";


export class ExternalInstanceImpl implements Imploder.ExternalInstance {

	constructor(private readonly config: Imploder.Config){
		if(!config.httpPort){
			throw new Error("Imploder external instance could not be created: there is no http port, won't be able to call the instance by http.");
		}
	}

	private callHttp(apiMethod: string): Promise<string> {
		return new Promise((ok, bad) => {
			let req = Http.request({
				host: "localhost",
				port: this.config.httpPort,
				path: "/" + apiMethod,
				method: "GET"
			}, resp => {
				let data: Buffer[] = [];
	
				resp.on("error", bad);
				resp.on("data", chunk => data.push(chunk));
				resp.on("end", () => {
					let dataStr = Buffer.concat(data).toString("utf8");
					if(Math.floor((resp.statusCode || 0) / 100) !== 2){
						bad(new Error(`Imploder returned HTTP ${resp.statusCode}:\n${data}`));
					} else {
						ok(dataStr);
					}
				})
			});
			
			req.on("error", err => bad(new Error("Imploder HTTP call failed: " + err.message)));
			req.end();
		});
	
	}

	async assembleBundleErrorsOnly(): Promise<void>{
		await this.callHttp("assemble_bundle_errors_only");
	}

	assembleBundle(): Promise<string>{
		return this.callHttp("assemble_bundle");
	}

}