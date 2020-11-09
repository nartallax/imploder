import {unlink} from "utils/afs"
import {WatchTestProject} from "test/watch_test_project";
import * as path from "path";
import {testProjectDir} from "test/test_project_utils";

export const ArbitraryTests: { readonly [testName: string]: (() => (boolean | Promise<boolean>))} = {
	"watch_simple": async () => {
		await new (class extends WatchTestProject {
			async run(){
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
		})("watch").run()

		return true;
	},

	// почему-то иногда этот тест зависает, но я никак не могу выловить, почему же
	"watch_with_transformers": async () => {
		await new (class extends WatchTestProject {
			async run(){
				await this.inTempDir(async () => {

					let configText = await this.readProjectFile("tsconfig.json");
					let conf = JSON.parse(configText);
					conf.tstoolConfig.transformerProjects = [
						path.resolve(testProjectDir(this.name), "../transformer_list_all_classes/tsconfig.json"),
						path.resolve(testProjectDir(this.name), "../transformer_change_ts/tsconfig.json")
					];
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
		})("watch").run();
		return true;
	}
}