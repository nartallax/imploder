import * as path from "path";
import * as fs from "fs";
import {Imploder} from "imploder";
import {fileExists, unlink, unlinkRecursive} from "utils/afs";
import {BundlerImpl} from "impl/bundler";
import {testListStr} from "generated/test_list_str";
import {testProjectDir, runTestBundle} from "./test_project_utils";
import {ImploderSingleRunCompiler} from "impl/compilers/single_run_compiler";
import {ImploderContextImpl} from "impl/context";
import {updateCliArgsWithTsconfig} from "impl/config";
import {LoggerImpl} from "impl/logger";

export interface SingleBuildTestProjectPathOverrides {
	ethalonBundle?: string;
	testBundle?: string;
}

export class SingleBuildTestProject {

	private readonly compileErrorText: string | null = this.fileContentOrNull("./compile_error.txt");
	private readonly runtimeErrorText: string | null = this.fileContentOrNull("./runtime_error.txt");
	private readonly runtimeErrorRegexp: string | null = this.fileContentOrNull("./runtime_error_regexp.txt");
	private readonly bundleText: string | null = this.fileContentOrNull(this.pathOverrides?.ethalonBundle ?? "./bundle.js");
	private readonly stdoutText: string | null = this.fileContentOrNull("./stdout.txt");
	private readonly codePrefixText: string | null = this.fileContentOrNull("./code_prefix.js");

	get testBundlePath(): string {
		return path.resolve(path.join(testProjectDir(this.name), this.pathOverrides?.testBundle ?? "./js/bundle.js"));
	}

	private _producedBundleText: string | null = null;
	get producedBundleText(): string {
		if(!this._producedBundleText){
			this._producedBundleText = this.fileContentOrNull(this.testBundlePath);
			if(this._producedBundleText === null){
				throw new Error("Expected test project \"" + this.name + "\" to produce bundle code, but it is not.");
			}
		}
		return this._producedBundleText;
	}

	private _context?: Imploder.Context;
	private get context(): Imploder.Context {
		if(!this._context){
			let config = updateCliArgsWithTsconfig({ 
				...this.cliArgsBase,
				tsconfigPath: path.join(testProjectDir(this.name), "./tsconfig.json") 
			});
			config.noBuildDiagnosticMessages = true;
			this._context = new ImploderContextImpl(config);
		}
		return this._context;
	}

	private _compiler: ImploderSingleRunCompiler | null = null
	private get compiler(): ImploderSingleRunCompiler {
		if(!this._compiler){
			let comp = this.context.compiler;
			if(!(comp instanceof ImploderSingleRunCompiler)){
				throw new Error("Unexpected compiler class in test.");
			}
			this._compiler = comp;
		}
		return this._compiler;
	}

	private _bundler: BundlerImpl | null = null;
	get bundler(): BundlerImpl {
		if(!this._bundler){
			this._bundler = new BundlerImpl(this.context);
		}
		return this._bundler;
	}

	constructor(
		readonly name: string,
		private readonly cliArgsBase: Imploder.CLIArgs,
		private readonly pathOverrides?: SingleBuildTestProjectPathOverrides
	){}

	private fileContentOrNull(subpath: string): string | null {
		let p = path.resolve(testProjectDir(this.name), subpath)
		try {
			fs.statSync(p);
		} catch(e){
			return null;
		}
		return fs.readFileSync(p, "utf8").trim();
	}

	private outputError(error: string): false {
		LoggerImpl.writeDefault("Test " + this.name + " failed: " + error);
		return false;
	}

	private checkError(err: Error | null, errType: string, errString: string | null, regexpString: string | null): boolean {
		if(errString || regexpString){
			if(!err){
				return this.outputError("expected " + errType + " error to be thrown, but it was not.");
			}
			let trimmedMessage = err.message.trim();
			if(errString && trimmedMessage !== errString){
				return this.outputError("expected " + errType + " error text to be \"" + errString + "\", but it's \"" + trimmedMessage + "\".");
			}
			if(regexpString){
				let regexp = new RegExp(regexpString);
				if(!regexp.test(trimmedMessage)){
					return this.outputError("expected " + errType + " error text to match \"" + regexpString + "\", but it's \"" + trimmedMessage + "\".")
				}
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
		return runTestBundle(this.producedBundleText, this.bundler, this.testBundlePath, this.codePrefixText);
	}

	private async checkStdout(): Promise<boolean> {
		let stdout = await this.runBundle();
		if(stdout !== this.stdoutText){
			return this.outputError("stdout text expected to be \"" + this.stdoutText + "\", but it's \"" + stdout + "\" instead.")
		}
		return true;
	}

	private async rmBuildProducts(){
		let outDirPath = path.join(testProjectDir(this.name), "./js");
		if(await fileExists(outDirPath)){
			await unlinkRecursive(outDirPath);
		}

		let generatedFilePath = path.join(testProjectDir(this.name), "./generated.ts");
		if(await fileExists(generatedFilePath)){
			await unlink(generatedFilePath);
		}
	}

	async run(): Promise<boolean> {
		await this.rmBuildProducts();
		let err: Error | null = null;

		try {
			await this.compiler.run();
			await this.bundler.produceBundle();
		} catch(e){
			err = e;
		}

		if(!this.checkError(err, "compile-time", this.compileErrorText, null)){
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
		
		if(!this.checkError(err, "runtime", this.runtimeErrorText, this.runtimeErrorRegexp)){
			return false;
		}
		if(err){
			return true;
		}
		
		return this.checkBundle();
	}

	static readonly excludedTestProjectDirectories = new Set([
		"watch",
		"transformer_list_all_classes",
		"transformer_change_ts",
		"transformer_report_error",
		"transformer_throw_error",
		"bundle_as_module",
		"profiles"
	])

	static readonly availableProjects: ReadonlyArray<string> = testListStr
		.split("\n")
		.map(_ => _.trim())
		.filter(_ => !!_ && !_.toLowerCase().match(/\.(ts|js)$/) && !SingleBuildTestProject.excludedTestProjectDirectories.has(_))

	static couldRunTest(name: string): boolean {
		return this.availableProjects.includes(name);
	}
	
	static runTest(name: string, cliArgsBase: Imploder.CLIArgs): Promise<boolean> {
		return new SingleBuildTestProject(name, cliArgsBase).run();
	}

}