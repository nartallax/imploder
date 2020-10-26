import {withTempDir, copyDir, readTextFile, writeTextFile, unlink} from "utils/afs"
import {Compiler} from "impl/compiler";
import * as path from "path";
import {getFullConfigFromCliArgs} from "impl/config";
import {Bundler} from "impl/bundler";
import {logErrorAndExit} from "utils/log";
import {runTestBundle, testProjectDir} from "./test_project_utils";

async function assertFileEquals(testedPath: string, goodPath: string): Promise<string> {
	let [testedContent, goodContent] = await Promise.all([readTextFile(testedPath), readTextFile(goodPath)]);
	if(testedContent !== goodContent){
		throw new Error(`File ${testedPath} does not matches expected content; it expected to contain the same as ${goodPath} contains:\n${testedContent}\n !== \n${goodContent}`);
	}
	return testedContent;
}

async function assertFileContentEquals(testedContent: string, goodPath: string){
	let content = await readTextFile(goodPath);
	if(content !== testedContent){
		throw new Error(`Assertion error: \n${testedContent}\n !== \n${content}\n (good content received from ${goodPath})`);
	}
}

export const ArbitraryTests: { readonly [testName: string]: (() => (boolean | Promise<boolean>))} = {
	"watch": async () => {
		await withTempDir("watchtest_", async projDir => {

			let writeProjectFile = async (filePath: string, content: string) => {
				filePath = path.join(projDir, filePath);
				await writeTextFile(filePath, content);
			}

			let waitWatchTriggered = () => new Promise(ok => setTimeout(ok, 1000))

			let bundleAndTest = async (goodBundlePath: string, goodStdoutPath: string) => {
				// файлвотчи срабатывают не мгновенно, нужно сколько-то подождать
				await waitWatchTriggered();
				await compiler.buildLock.withLock(async () => {
					await bundler.produceBundle();
					let bundle = await assertFileEquals(path.join(projDir, "./js/bundle.js"), path.join(projDir, goodBundlePath));;
					let stdout = await runTestBundle(bundle, bundler);
					await assertFileContentEquals(stdout, path.join(projDir, goodStdoutPath));
				});
			}

			let checkErrors = async (codes: number[]) => {
				await waitWatchTriggered();
				await compiler.buildLock.withLock(async () => {
					let diag = compiler.getLastBuildDiagnostics()
					let absentCodes = new Set(codes);
					diag.forEach(diag => {
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

			await copyDir(testProjectDir("watch"), projDir);
			let config = getFullConfigFromCliArgs(["--tsconfig", path.join(projDir, "./tsconfig.json")])
			config.noBuildDiagnosticMessages = true;
			let compiler = new Compiler(config);
			let bundler = new Bundler(compiler);
			await compiler.startWatch();
			await bundleAndTest("./bundle_a.js", "./stdout_a.txt");

			await writeProjectFile("main.ts", "export function main(){console.log('Hello world 2!')}");
			await bundleAndTest("./bundle_b.js", "./stdout_b.txt");

			await writeProjectFile("main.ts", `import {myConst} from "consts"; export function main(){console.log("MyConst = " + myConst)}`);
			await checkErrors([2307]); // module not found

			await writeProjectFile("consts.ts", `export const myConst = "this is constant!"`);
			await bundleAndTest("./bundle_c.js", "./stdout_c.txt");

			await unlink(path.join(projDir, "consts.ts"));
			await checkErrors([2307]); // module not found

			await writeProjectFile("consts.ts", `export const myConst = "this is constant2!"`);
			await bundleAndTest("./bundle_d.js", "./stdout_d.txt");

			
			compiler.stopWatch();
			await compiler.buildLock.withLock(() => {});

			void logErrorAndExit;
			//logErrorAndExit("STOP " + projDir);
		});

		return true;
	}
}