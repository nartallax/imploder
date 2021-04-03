import {readTextFile, unlink, writeTextFile} from "utils/afs"
import {WatchTestProject} from "test/watch_test_project";
import * as path from "path";
import * as http from "http";
import {testProjectDir, wrapConsoleLog} from "test/test_project_utils";
import {Imploder} from "imploder";
import {SingleBuildTestProject} from "test/single_build_test_project";

function httpGetBundle(port: number): Promise<{code: number, body: string}> {
	return new Promise((ok, bad) => {
		let req = http.request({
			host: "localhost",
			port: port,
			path: "/assemble_bundle"
		}, resp => {
			let data: Buffer[] = [];
			resp.on("error", bad);
			resp.on("data", chunk => data.push(chunk));
			resp.on("end", () => ok({
				code: resp.statusCode || -1,
				body: Buffer.concat(data).toString("utf-8")
			}))
		});

		req.on("error", bad);

		req.end();
	});

}

async function bundleRunThenRunJs(jsName: string, cliArgsBase: Imploder.CLIArgs) {
	let proj = new SingleBuildTestProject("bundle_as_module", cliArgsBase);
	if(!await proj.run()) {
		return false;
	}
	let wrappedBundle = await proj.bundler.wrapBundleCode(proj.producedBundleText);
	let fullPathToWrappedBundle = path.resolve(testProjectDir(proj.name), "./js/bundle_wrapped.js")
	await writeTextFile(fullPathToWrappedBundle, wrappedBundle);
	let otherProjectEntryPoint = path.resolve(testProjectDir(proj.name), jsName)
	let projectCode = await readTextFile(otherProjectEntryPoint);

	let [stdout] = await wrapConsoleLog(() => new Promise((ok, bad) => {
		let testIsCompleted = ok
		void testIsCompleted;
		try {
			eval(projectCode);
		} catch(e) {
			bad(e);
		}
	}));
	if(stdout !== "42! spice must flow") {
		console.error("Test failed: stdout not matches expected: " + stdout);
	}
	return true;
}

export const ArbitraryTests: {readonly [testName: string]: ((cliArgsBase: Imploder.CLIArgs) => (boolean | Promise<boolean>))} = {
	"watch_simple": async cliArgsBase => {
		await new (class extends WatchTestProject {
			async run() {
				await this.inTempDir(async () => {
					await this.withCompilerRunning(async () => {
						await this.bundleAndTest("./bundle_a.js", "./stdout_a.txt");

						await this.writeProjectFile("main.ts", "export function main(){console.log('Hello world 2!')}");
						await this.bundleAndTest("./bundle_b.js", "./stdout_b.txt");

						await this.writeProjectFile("main.ts", `import {myConst} from "consts"; export function main(){console.log("MyConst = " + myConst)}`);
						await this.checkErrors([2307]); // module not found

						await this.writeProjectFile("consts.ts", `export const myConst = "this is constant!"`);
						await this.bundleAndTest("./bundle_c.js", "./stdout_c.txt");

						await unlink(this.resolveProjectFilePath("consts.ts"));
						await this.checkErrors([2307]); // module not found

						await this.writeProjectFile("consts.ts", `export const myConst = "this is constant2!"`);
						await this.bundleAndTest("./bundle_d.js", "./stdout_d.txt");
					})
				})
			}
		})("watch", cliArgsBase).run()

		return true;
	},

	// почему-то иногда этот тест зависает, но я никак не могу выловить, почему же
	"watch_with_transformers": async cliArgsBase => {
		await new (class extends WatchTestProject {
			async run() {
				await this.inTempDir(async () => {

					let configText = await this.readProjectFile("tsconfig.json");
					let conf = JSON.parse(configText);
					conf.imploderConfig.transformers = [{
						imploderProject: path.resolve(testProjectDir(this.projectName), "../transformer_list_all_classes/tsconfig.json")
					}, {
						imploderProject: path.resolve(testProjectDir(this.projectName), "../transformer_change_ts/tsconfig.json")
					}];
					await this.writeProjectFile("tsconfig.json", JSON.stringify(conf));

					// создавать этот файл нужно строго до запуска компиляции
					// иначе компилятор не видит этот файл, и не гоняет на нем трансформеры
					// видимо, добавлять ссылки на модули в трансформере - слишком сложно для него
					await this.writeProjectFile("utils.ts", "export function logText(text: string){console.log('LOGTEXT: ' + text)}");

					await this.withCompilerRunning(async () => {
						await this.bundleAndTest("./bundle_ta.js", "./stdout_ta.txt");

						await this.writeProjectFile("impl.ts", "import {SomeInterface} from 'main'; export class ImplA implements SomeInterface { getText() { return 'impla!' } }");
						// тут есть микропроблема - вотч отрабатывает не мгновенно
						// соответственно, генератор тоже отрабатывает не мгновенно
						// если мы подождем, пока генератор отработает - все будет окей
						// противодействие этому - импортировать модуль impl из main
						// но это слегка убивает весь смысл
						// я пока не уверен, насколько это плохо. может, в реальной жизни будет и ничего
						// (эта проблема есть только при создании/удалении файлов)
						// (при изменении файлов, как видно с bundle_td.js, все отрабатывает за один раз)
						// (и при удалении тоже за один раз - bundle_te.js)
						await this.waitWatchTriggered();
						await this.writeProjectFile("main.ts", "import {myClassEnumeration} from 'generated'; export interface SomeInterface { getText(): string } export function main(){ console.log(myClassEnumeration.map(cls => new cls().getText()).join('; ')) }");
						await this.bundleAndTest("./bundle_tb.js", "./stdout_tb.txt");
						await this.writeProjectFile("impl_b.ts", "import {SomeInterface} from 'main'; export class ImplB implements SomeInterface { getText() { return 'implb!' } }");
						await this.waitWatchTriggered();
						await this.bundleAndTest("./bundle_tc.js", "./stdout_tc.txt");
						await this.writeProjectFile("impl_b.ts", "import {SomeInterface} from 'main'; export class ImplB implements SomeInterface { getText() { return 'implbbb!' } }");
						await this.bundleAndTest("./bundle_td.js", "./stdout_td.txt");
						await this.deleteProjectFile("./impl.ts");
						await this.bundleAndTest("./bundle_te.js", "./stdout_te.txt");
					});
				});
			}
		})("watch", cliArgsBase).run();
		return true;
	},

	"bundle_as_commonjs_module": cliArgsBase => bundleRunThenRunJs("./commonjs_project.js", cliArgsBase),
	"bundle_as_amd_module": cliArgsBase => bundleRunThenRunJs("./amd_project.js", cliArgsBase),

	"profiles": async cliArgsBase => {
		let args = {...cliArgsBase, profile: "for_old"};
		let forOld = new SingleBuildTestProject("profiles", args, {ethalonBundle: "oldBundle.js", testBundle: "./js/bundle_old.js"});
		if(!(await forOld.run())) {
			return false;
		}

		args = {...cliArgsBase, profile: "for_new"};
		let forNew = new SingleBuildTestProject("profiles", args, {ethalonBundle: "newBundle.js", testBundle: "./js/bundle_new.js"});
		if(!(await forNew.run())) {
			return false;
		}

		return true;
	},

	"lazy_start": async cliArgsBase => {
		await new (class extends WatchTestProject {
			async run() {
				await this.inTempDir(async () => {
					let portNum = 57372; // arbitrary

					let configText = await this.readProjectFile("tsconfig.json");
					let conf = JSON.parse(configText);
					conf.imploderConfig.lazyStart = true;
					conf.imploderConfig.httpPort = portNum;
					conf.imploderConfig.showErrorsOverHttp = true;
					await this.writeProjectFile("tsconfig.json", JSON.stringify(conf));

					let compiler = this.compiler; // ensuring the compiler is existent
					void compiler;

					await this.withHttpApi(async () => {
						await this.writeProjectFile("main.ts", "ONONONONONO");
						let httpResp = await httpGetBundle(portNum);
						if(httpResp.code !== 500 || httpResp.body.indexOf("Error: Cannot find name") < 0) {
							throw new Error("Bad response to invalid code. Expected HTTP 500 and errors, got " + httpResp.code + " and " + httpResp.body);
						}
					})
					// if compiler is not explicitly shut down, test process exits with code 1... for some reason
					// dunno, let's just shutdown
					await this.shutdownCompiler();
				});
			}
		})("watch", cliArgsBase).run();
		return true;
	}
}