import * as path from "path";
import * as fs from "fs";
import {Compiler} from "compiler";
import {logInfo, logError} from "log";
import {testListStr} from "generated/test_list_str";
import {fileExists, unlinkRecursive} from "afs";
import {getFullConfigFromCliArgs} from "config";

class TestProject {

	private static testsRoot = path.resolve(__dirname, "./test/");

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
				"--tsconfig", path.join(TestProject.testsRoot, this.name, "./tsconfig.json")
			])
			this._compiler = new Compiler(config);
		}
		return this._compiler;
	}

	constructor(private readonly name: string){}

	private fileContentOrNull(subpath: string): string | null {
		let p = path.join(TestProject.testsRoot, this.name, subpath)
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

	// тут я слегка полагаютсь на то, что в коде теста не будет совсем уж полной дестроерской дичи
	// в смысле, тесты не должны никак корраптить глобальные объекты и т.д.
	// по-хорошему нужно спавнить новые процессы и ловить их вывод
	private async runBundle(): Promise<string> {
		let outerConsole = console;
		let stdout = [] as string[];
		await (() => {
			return new Promise((ok, bad) => {
				let console = { 
					...outerConsole,
					log: (...values: string[]) => {
						let str = values.join(" ");
						stdout.push(str);
					}
				};
				let nop = () => {};
				
				// смысл в изворотах с mainThen - в том, что код энтрипоинта исполняется асинхронно
				// а нам нужно дождаться, когда он все-таки закончит исполняться, или кинет ошибку
				// в каких-то случаях он все-таки исполняется синхронно (отсутствие асинхронного кода/асинхронных импортов)
				// и тогда в этом всем нет особого смысла
				// но в случае, например, если нам нужно поймать асинхронно кидаемую из энтрипоинта ошибку - 
				// то нам нужен результат его исполнения (который мы здесь и получаем, и await-им, ибо это Promise)
				let mainThen = async (err: Error | null, result: any) => {
					if(err){
						bad(err);
					} else {
						try {
							await Promise.resolve(result);
							ok();
						} catch(e){
							bad(e);
						}
					}
				}
				
				void console;
				void nop;
				void mainThen;
				let allCode = [
					this.compiler.bundler.getPrefixCode(), 
					this.producedBundleText, 
					this.compiler.bundler.getPostfixCode("mainThen")
				].join("\n");
				try {
					eval(allCode);
				} catch(e){
					bad(e)
				}
			});
		})();
		return stdout.join("\n");
	}

	private async checkStdout(): Promise<boolean> {
		let stdout = await this.runBundle();
		if(stdout !== this.stdoutText){
			return this.outputError("stdout text expected to be \"" + this.stdoutText + "\", but it's \"" + stdout + "\" instead.")
		}
		return true;
	}

	private async rmOutDir(){
		let outDirPath = path.join(TestProject.testsRoot, this.name, "./js");
		if(await fileExists(outDirPath)){
			await unlinkRecursive(outDirPath);
		}
	}

	async run(): Promise<boolean> {
		logInfo("Running test for " + this.name);
		await this.rmOutDir();
		let err: Error | null = null;

		try {
			await this.compiler.runSingle();
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

}

const knownTestNames: ReadonlyArray<string> = testListStr
	.split("\n")
	.map(_ => _.trim())
	.filter(_ => !!_)
	.filter(_ => _ !== "proj_synth")

export async function runAllTests(){
	logInfo("Running all tests.");

	let failCount = 0;
	for(let testName of knownTestNames){
		let result = await new TestProject(testName).run();
		if(!result)
			failCount++;
	}

	if(failCount < 1){
		logInfo("Done. Testing successful.");
		process.exit(0);
	} else {
		logInfo("Done. Testing failed (" + failCount + " / " + knownTestNames.length + " tests failed)");
		process.exit(1);
	}
	
}

export async function runSingleTest(name: string){
	if(knownTestNames.indexOf(name) < 0){
		logError("Test name \"" + name + "\" is not known.");
		process.exit(1);
	}

	let ok = await new TestProject(name).run();
	if(!ok){
		logInfo("Done. Test failed.")
		await new Promise(ok => setTimeout(ok, 1000))
		process.exit(1);
	} else {
		logInfo("Done. Testing successful.")
		await new Promise(ok => setTimeout(ok, 1000))
		process.exit(0);
	}
}