import {readTextFile, withTempDir, writeTextFile, copyDir } from "utils/afs";
import * as path from "path";
import * as TSTool from "tstool";
import {runTestBundle, testProjectDir} from "test/test_project_utils";
import {TSToolContextImpl} from "impl/context";
import {updateCliArgsWithTsconfig} from "impl/config";
import {TSToolWatchCompiler} from "impl/compilers/watch_compiler";
import {BundlerImpl} from "impl/bundler";

export class WatchTestProject {
	
	protected projDir: string | null = null;
	protected inTempDir<T>(action: () => T | Promise<T>): Promise<T> {
		return withTempDir("watchtest_" + this.name + "_", async projDir => {
			this.projDir = projDir;
			try {
				let projSourceDir = testProjectDir(this.name) 
				await copyDir(projSourceDir, this.projDir);
				await this.compiler.run();
				return await Promise.resolve(action());
			} finally {
				if(this._compiler){ // возможно, компилятор не успел инициализироваться
					this.compiler.stopWatch();
					await this.compiler.buildLock.withLock(() => {});
				}
				this.projDir = null;
				this._context = null;
				this._compiler = null;
			}
		})
	}

	private _context: TSTool.Context | null = null;
	protected get context(): TSTool.Context {
		if(!this._context){
			let config = updateCliArgsWithTsconfig({ tsconfigPath: this.resolveProjectFilePath("tsconfig.json") })
			config.noBuildDiagnosticMessages = true;
			this._context = new TSToolContextImpl(config);
		}
		return this._context
	}

	private _compiler: TSToolWatchCompiler | null = null;
	protected get compiler(): TSToolWatchCompiler {
		if(!this._compiler){
			let compiler = this.context.compiler;
			if(!(compiler instanceof TSToolWatchCompiler)){
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

	protected readProjectFile(filePath: string): Promise<string> {
		return readTextFile(this.resolveProjectFilePath(filePath));
	}
	
	protected waitWatchTriggered(): Promise<void>{
		return new Promise(ok => setTimeout(ok, 1000));
	}

	protected async bundleAndTest(goodBundlePath: string, goodStdoutPath: string): Promise<void>{
		// файлвотчи срабатывают не мгновенно, нужно сколько-то подождать
		await this.waitWatchTriggered();
		await this.compiler.buildLock.withLock(async () => {
			await this.context.bundler.produceBundle();
			let bundle = await this.assertFileEquals("js/bundle.js", goodBundlePath);
			let stdout = await runTestBundle(bundle, this.context.bundler as BundlerImpl);
			await this.assertFileContentEquals(stdout, goodStdoutPath);
		});
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

	constructor(private readonly name: string){}
}