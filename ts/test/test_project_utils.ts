import * as path from "path";
import * as fs from "fs";
import {BundlerImpl} from "impl/bundler";
import {LoggerImpl} from "impl/logger";

let testProjectsRoot: string | null = null;
export function testProjectDir(name: string): string {
	if(!testProjectsRoot){
		let root = path.resolve(__dirname, "./test_projects/");
		try {
			fs.statSync(root);
		} catch(e){
			LoggerImpl.writeDefaultAndExit(`Failed to stat() test projects root directory (which is ${root}). Maybe you're trying to run tests on packed npm package? You cannot do that; you may only run tests on source code.`);
		}
		testProjectsRoot = root;
	}
	return path.join(testProjectsRoot, name);
}

export async function wrapConsoleLog<T>(action: () => T | Promise<T>): Promise<[string, T]>{
	let outerConsole = console;
	let stdout = [] as string[];
	let result: T;
	{
		let console = { 
			...outerConsole,
			log: (...values: string[]) => {
				let str = values.join(" ");
				stdout.push(str);
			}
		};
		(global as any).console = console;

		try {
			result = await Promise.resolve(action());
		} finally {
			(global as any).console = outerConsole;
		}
	}
	return [stdout.join("\n"), result];
}

// тут я слегка полагаютсь на то, что в коде теста не будет совсем уж полной дестроерской дичи
// в смысле, тесты не должны никак корраптить глобальные объекты и т.д.
// по-хорошему нужно спавнить новые процессы и ловить их вывод
export async function runTestBundle(code: string, bundler: BundlerImpl): Promise<string> {
	let [stdout] = await wrapConsoleLog(() => {
		return new Promise<void>(async (ok, bad) => {
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
		});
	});

	return stdout;
}