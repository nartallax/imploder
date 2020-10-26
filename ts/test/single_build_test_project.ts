import * as path from "path";
import * as fs from "fs";
import {Compiler} from "impl/compiler";
import {logError} from "utils/log";
import {fileExists, unlinkRecursive} from "utils/afs";
import {getFullConfigFromCliArgs} from "impl/config";
import {Bundler} from "impl/bundler";
import {testListStr} from "generated/test_list_str";
import {testProjectDir, runTestBundle} from "./test_project_utils";

export class SingleBuildTestProject {

	private readonly compileErrorText: string | null = this.fileContentOrNull("./compile_error.txt");
	private readonly runtimeErrorText: string | null = this.fileContentOrNull("./runtime_error.txt");
	private readonly bundleText: string | null = this.fileContentOrNull("./bundle.js");
	private readonly stdoutText: string | null = this.fileContentOrNull("./stdout.txt");

	private _producedBundleText: string | null = null;
	private get producedBundleText(): string {
		if(!this._producedBundleText){
			this._producedBundleText = this.fileContentOrNull("./js/bundle.js");
			if(this._producedBundleText === null){
				throw new Error("Expected test project \"" + this.name + "\" to produce bundle code, but it is not.");
			}
		}
		return this._producedBundleText;
	}

	private _compiler: Compiler | null = null
	private get compiler(): Compiler {
		if(!this._compiler){
			let config = getFullConfigFromCliArgs([
				"--tsconfig", path.join(testProjectDir(this.name), "./tsconfig.json")
			])
			this._compiler = new Compiler(config);
		}
		return this._compiler;
	}

	private _bundler: Bundler | null = null;
	private get bundler(): Bundler {
		if(!this._bundler){
			this._bundler = new Bundler(this.compiler);
		}
		return this._bundler;
	}

	constructor(private readonly name: string){}

	private fileContentOrNull(subpath: string): string | null {
		let p = path.join(testProjectDir(this.name), subpath)
		try {
			fs.statSync(p);
		} catch(e){
			return null;
		}
		return fs.readFileSync(p, "utf8").trim();
	}

	private outputError(error: string): false {
		logError("Test " + this.name + " failed: " + error);
		return false;
	}

	private checkError(err: Error | null, errType: string, errString: string | null): boolean {
		if(errString){
			if(!err){
				return this.outputError("expected " + errType + " error to be thrown, but it was not.");
			}
			let trimmedMessage = err.message.trim();
			if(trimmedMessage !== errString){
				return this.outputError("expected " + errType + " error text to be \"" + errString + "\", but it's \"" + trimmedMessage + "\".");
			}
		} else if(err){
			return this.outputError((err.stack || err.message || err) + "");
		}

		return true;
	}

	private checkBundle(): boolean {
		if(this.producedBundleText !== this.bundleText){
			return this.outputError("bundles are different.");
		}

		return true;
	}

	private runBundle(): Promise<string> {
		return runTestBundle(this.producedBundleText, this.bundler)
	}

	private async checkStdout(): Promise<boolean> {
		let stdout = await this.runBundle();
		if(stdout !== this.stdoutText){
			return this.outputError("stdout text expected to be \"" + this.stdoutText + "\", but it's \"" + stdout + "\" instead.")
		}
		return true;
	}

	private async rmOutDir(){
		let outDirPath = path.join(testProjectDir(this.name), "./js");
		if(await fileExists(outDirPath)){
			await unlinkRecursive(outDirPath);
		}
	}

	async run(): Promise<boolean> {
		await this.rmOutDir();
		let err: Error | null = null;

		try {
			await this.compiler.runSingle();
			let bundler = new Bundler(this.compiler);
			await bundler.produceBundle();
		} catch(e){
			err = e;
		}

		if(!this.checkError(err, "compile-time", this.compileErrorText)){
			return false;
		}
		if(err){
			return true;
		}

		try {
			if(!(await this.checkStdout())){
				return false;
			}
		} catch(e){
			err = e;
		}
		
		if(!this.checkError(err, "runtime", this.runtimeErrorText)){
			return false;
		}
		if(err){
			return true;
		}
		
		return this.checkBundle();
	}

	static readonly availableProjects: ReadonlyArray<string> = testListStr
		.split("\n")
		.map(_ => _.trim())
		.filter(_ => !!_ && _ !== "watch")

	static couldRunTest(name: string): boolean {
		return this.availableProjects.includes(name);
	}
	
	static runTest(name: string): Promise<boolean> {
		return new SingleBuildTestProject(name).run();
	}

}