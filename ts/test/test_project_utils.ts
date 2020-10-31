import * as path from "path";
import {BundlerImpl} from "impl/bundler";

export const testProjectsRoot = path.resolve(__dirname, "./test_projects/");
export function testProjectDir(name: string): string {
	return path.join(testProjectsRoot, name);
}

// тут я слегка полагаютсь на то, что в коде теста не будет совсем уж полной дестроерской дичи
// в смысле, тесты не должны никак корраптить глобальные объекты и т.д.
// по-хорошему нужно спавнить новые процессы и ловить их вывод
export async function runTestBundle(code: string, bundler: BundlerImpl): Promise<string> {
	let outerConsole = console;
	let stdout = [] as string[];
	await (() => {
		return new Promise(async (ok, bad) => {
			let console = { 
				...outerConsole,
				log: (...values: string[]) => {
					let str = values.join(" ");
					stdout.push(str);
				}
			};
			(global as any).console = console;
			try {
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
				let allCode = await bundler.wrapBundleCode(code, {afterEntryPointExecuted: "mainThen"});
				try {
					eval(allCode);
				} catch(e){
					bad(e)
				}
			} finally {
				(global as any).console = outerConsole;
			}
		});
	})();
	return stdout.join("\n");
}