import {Imploder} from "imploder"
import * as http from "http"
import {typescriptDiagnosticEntryToString} from "utils/tsc_diagnostics"
import {ImploderWatchCompiler} from "impl/compilers/watch_compiler"

export class HttpApi implements Imploder.HttpApi {
	private readonly server: http.Server

	constructor(private readonly context: Imploder.Context) {
		this.server = http.createServer((req, res) => this.handle(req, res))
	}

	private updateShutdownTimeout(): void {
		let timeout = this.context.config.idleTimeout
		if(timeout === undefined || timeout < 0){
			return
		}
		let compiler = this.context.compiler
		if(!(compiler instanceof ImploderWatchCompiler)){
			this.context.logger.error("Cannot set shutdown timeout when compiler is not in watch mode.")
			return
		}
		compiler.shutdownAfter(timeout * 1000)
	}

	private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		this.updateShutdownTimeout()
		try {
			if(!req.url){
				throw new Error("No url in HTTP request!")
			}
			let url = new URL(req.url, "http://localhost")
			if(!url.pathname){
				throw new Error("Expected HTTP request to have path; got none.")
			}
			let [resultCode, resultBody] = await this.runFunction(url.pathname)
			res.statusCode = resultCode
			res.end(resultBody)
		} catch(e){
			this.context.logger.error((e as Error).stack || (e as Error).message)
			res.statusCode = 500
			res.end("Some error happened.")
		}
	}

	private async getBundle(): Promise<{httpCode: number, err?: string, bundle?: string}> {
		await this.context.compiler.run()
		await this.context.compiler.waitBuildEnd()
		if(!this.context.compiler.lastBuildWasSuccessful){
			let errorStr: string
			if(!this.context.config.showErrorsOverHttp){
				errorStr = "There was errors during build."
			} else {
				errorStr = this.context.compiler.lastBuildDiagnostics
					.map(x => typescriptDiagnosticEntryToString(x, this.context.compiler.projectRoot))
					.join("\n")
			}
			return {httpCode: 500, err: errorStr}
		}
		let bundleCode = await this.context.bundler.produceBundle()
		return {httpCode: 200, bundle: bundleCode}
	}

	private async runFunction(name: string): Promise<[number, string]> {
		switch (name.toLowerCase().replace(/(^\/|\/$)/g, "")){
			// добавляя методы сюда, не забывай, что сначала их нужно добавить в ExternalInstance
			case "assemble_bundle_silent":{
				let res = await this.getBundle()
				return [res.httpCode, res.err ? "There was errors" : "All ok"]
			}
			case "assemble_bundle_errors_only":{
				let res = await this.getBundle()
				return [res.httpCode, res.err || ""]
			}
			case "assemble_bundle":{
				let res = await this.getBundle()
				return [res.httpCode, res.err || res.bundle || ""]
			}
			default: throw new Error("Unknown HTTP API endpoint: " + name)
		}
	}

	start(): Promise<void> {
		if(!this.context.config.httpPort){
			throw new Error("HTTP port number is not passed, could not start server.")
		}
		return new Promise((ok, bad) => {
			try {
				this.server.listen(this.context.config.httpPort, "localhost", () => {
					this.context.logger.debug("HTTP server listening at http://localhost:" + this.context.config.httpPort)
					this.updateShutdownTimeout()
					ok()
				})
			} catch(e){
				bad(e)
			}
		})
	}

	stop(): Promise<void> {
		return new Promise((ok, bad) => {
			this.server.close(err => err ? bad(err) : ok())
		})
	}

}