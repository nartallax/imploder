import {unlink} from "utils/afs"
import {WatchTestProject} from "test/watch_test_project";

export const ArbitraryTests: { readonly [testName: string]: (() => (boolean | Promise<boolean>))} = {
	"watch_simple": async () => {
		await new (class extends WatchTestProject {
			async run(){
				await this.inTempDir(async () => {
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
			}
		})("watch").run()

		return true;
	}
}