import {readTextFile, withTempDir, writeTextFile, copyDir, unlink } from "utils/afs";
import * as path from "path";
import {Imploder} from "imploder";
import {runTestBundle, testProjectDir} from "test/test_project_utils";
import {ImploderContextImpl} from "impl/context";
import {updateCliArgsWithTsconfig} from "impl/config";
import {ImploderWatchCompiler} from "impl/compilers/watch_compiler";
import {BundlerImpl} from "impl/bundler";
import {HttpApi} from "impl/http_api";

export class WatchTestProject {
	
	protected projDir: string | null = null;
	protected inTempDir<T>(action: () => T | Promise<T>): Promise<T> {
		return withTempDir("watchtest_" + this.projectName + "_", async projDir => {
			this.projDir = projDir;
			try {
				await copyDir(testProjectDir(this.projectName) , this.projDir);
				return await Promise.resolve(action());
			} finally {
				this.projDir = null;
			}
		})
	}

	protected async withHttpApi<T>(action: () => T | Promise<T>): Promise<T>{
		let api = new HttpApi(this.context);
		try {
			await api.start();
			return await Promise.resolve(action());
		} finally {
			await api.stop();
		}
	}

	protected async withCompilerRunning<T>(action: () => T | Promise<T>): Promise<T> {
		try {
			await this.compiler.run();
			return await Promise.resolve(action());
		} finally {
			await this.shutdownCompiler();
		}
	}

	protected async shutdownCompiler(): Promise<void>{
		this.compiler.stop();
		await this.compiler.buildLock.withLock(() => {});
		this._compiler = null;
		this._context = null;
	}

	private _context: Imploder.Context | null = null;
	protected get context(): Imploder.Context {
		if(!this._context){
			let config = updateCliArgsWithTsconfig({ 
				...this.cliArgsBase,
				tsconfigPath: this.resolveProjectFilePath("tsconfig.json")
			})
			config.noBuildDiagnosticMessages = true;
			this._context = new ImploderContextImpl(config);
		}
		return this._context
	}

	private _compiler: ImploderWatchCompiler | null = null;
	protected get compiler(): ImploderWatchCompiler {
		if(!this._compiler){
			let compiler = this.context.compiler;
			if(!(compiler instanceof ImploderWatchCompiler)){
				throw new Error("Unexpected compiler class in test.");
			}
			this._compiler = compiler;
		}
		return this._compiler
	}

	protected resolveProjectFilePath(p: string): string {
		if(!this.projDir){
			throw new Error("No temporary project directory is created! Could not resolve file path.");
		}
		return path.join(this.projDir, p);
	}

	protected async assertFileEquals(testedPath: string, goodPath: string): Promise<string> {
		let [testedContent, goodContent] = await Promise.all([
			this.readProjectFile(testedPath), 
			this.readProjectFile(goodPath)]
		);
		if(testedContent !== goodContent){
			throw new Error(`File ${testedPath} does not matches expected content; it expected to contain the same as ${goodPath} contains:\n${testedContent}\n !== \n${goodContent}`);
		}
		return testedContent;
	}
	
	protected async assertFileContentEquals(testedContent: string, goodPath: string){
		let content = await this.readProjectFile(goodPath);
		if(content !== testedContent){
			throw new Error(`Assertion error: \n${testedContent}\n !== \n${content}\n (good content received from ${goodPath})`);
		}
	}

	protected writeProjectFile(filePath: string, content: string): Promise<void>{
		return writeTextFile(this.resolveProjectFilePath(filePath), content);
	}

	protected deleteProjectFile(filePath: string): Promise<void>{
		return unlink(this.resolveProjectFilePath(filePath));
	}

	protected readProjectFile(filePath: string): Promise<string> {
		return readTextFile(this.resolveProjectFilePath(filePath));
	}
	
	protected async waitWatchTriggered(): Promise<void>{
		await new Promise(ok => setTimeout(ok, 1000));
		await this.compiler.waitBuildEnd();
	}

	protected async bundleAndTest(goodBundlePath: string, goodStdoutPath: string): Promise<void>{
		// файлвотчи срабатывают не мгновенно, нужно сколько-то подождать
		await this.waitWatchTriggered();
		await this.context.bundler.produceBundle();
		let bundle = await this.assertFileEquals("js/bundle.js", goodBundlePath);
		let stdout = await runTestBundle(bundle, this.context.bundler as BundlerImpl);
		await this.assertFileContentEquals(stdout, goodStdoutPath);
	}

	protected async checkErrors(codes: number[]): Promise<void> {
		await this.waitWatchTriggered();
		await this.compiler.buildLock.withLock(async () => {
			let absentCodes = new Set(codes);
			this.compiler.lastBuildDiagnostics.forEach(diag => {
				//console.log("DIAG: " + x.code + " " + x.messageText);
				if(absentCodes.has(diag.code)){
					absentCodes.delete(diag.code);
				}
			});
			if(absentCodes.size > 0){
				throw new Error("Build errors does not contain expected build errors: " + [...absentCodes].join(", "));
			}
		});
	}

	constructor(
		protected readonly projectName: string,
		protected cliArgsBase: Imploder.CLIArgs
	){}
}