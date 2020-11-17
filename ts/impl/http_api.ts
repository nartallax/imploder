import * as Imploder from "imploder";
import * as http from "http";
import * as URL from "url";
import {logDebug, logError} from "utils/log";
import {typescriptDiagnosticEntryToString} from "utils/tsc_diagnostics";

export class HttpApi {
	private readonly server: http.Server; 

	constructor(private readonly context: Imploder.Context){
		this.server = http.createServer((req, res) => this.handle(req, res));
	}

	private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			if(!req.url){
				throw new Error("No url in HTTP request!");
			}
			let url = URL.parse(req.url);
			if(!url.pathname){
				throw new Error("Expected HTTP request to have path; got none.");
			}
			let [resultCode, resultBody] = await this.runFunction(url.pathname);
			res.statusCode = resultCode;
			res.end(resultBody);
		} catch(e){
			logError(e);
			res.statusCode = 500;
			res.end("Some error happened.")
		}
	}

	private async runFunction(name: string): Promise<[number, string]>{
		switch(name.toLowerCase().replace(/(^\/|\/$)/g, "")){
			case "assemble_bundle":
				await this.context.compiler.waitBuildEnd();
				if(!this.context.compiler.lastBuildWasSuccessful){
					let errorStr: string;
					if(!this.context.config.showErrorsOverHttp){
						errorStr = "There was errors during build.";
					} else {
						errorStr = this.context.compiler.lastBuildDiagnostics
							.map(x => typescriptDiagnosticEntryToString(x))
							.join("\n");
					}
					return [500, errorStr];
				}
				let bundleCode = await this.context.bundler.produceBundle();;
				return [200, bundleCode];
			default: throw new Error("Unknown HTTP API endpoint: " + name);
		}
	}

	start(): Promise<void> {
		if(!this.context.config.httpPort){
			throw new Error("HTTP port number is not passed, could not start server.");
		}
		return new Promise((ok, bad) => {
			try {
				this.server.listen(this.context.config.httpPort, "localhost", () => {
					logDebug("HTTP server listening at http://localhost:" + this.context.config.httpPort);
					ok();
				});
			} catch(e){bad(e)}
		});
	}

}