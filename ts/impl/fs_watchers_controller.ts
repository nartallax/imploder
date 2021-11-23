import {Imploder} from "imploder";
import * as Tsc from "typescript";
import * as Path from "path";

interface WatcherWithRefcount {
	watchers: Tsc.FileWatcher[];
	refcount: number;
}

// список всех выданных filewatcher-ов
// зачем? чтобы иметь возможность их завершать. почему-то сами они завершаются не всегда
let allKnownWatchers = new Map<string, WatcherWithRefcount>();

function refWatcher(path: string, watcher: Tsc.FileWatcher){
	let item = allKnownWatchers.get(path);
	if(item){
		item.refcount++;
		item.watchers.push(watcher);
	} else {
		allKnownWatchers.set(path, {
			watchers: [watcher],
			refcount: 1
		});
	}
}

function derefWatcher(path: string){
	let item = allKnownWatchers.get(path);
	if(!item){
		return; // ehhh?
	}
	if(item.refcount === 1){
		allKnownWatchers.delete(path)
		item.watchers.forEach(watcher => {
			try {
				watcher.close();
			} catch(e){
				// иногда вотчеры закрываются при закрытии компилятора
				// тогда здесь будет ошибка
			}
		})
	} else {
		item.refcount--;
	}
}


/** Класс, заведующий файловыми вотчерами одного инстанса компилятора
 * Такие сложности нужны потому, что в пределах одного процесса может быть несколько разных инстансов компилятора
 * (для разных же проектов)
 * При этом они могут захотеть watch-ить одни и те же файлы (например, .d.ts из node_modules)
 * При этом после .close() компилятора файловые вотчеры сами не всегда завершаются
 * Вследствие чего процесс, запустивший компиляторы, не завершается, когда должен
 * Поэтому мы закрываем файловые вотчеры вручную, когда они не нужны
 * Но! если разные компиляторы запрашивают файловые вотчеры для одних и тех же файлов - то вотчеры реюзаются
 * Т.е. если ты закроешь файловый вотчер для одного компилятора - то он закроется и в другом
 * Это плохо, потому что мешает нормальному завершению компиляторов
 * Поэтому мы считаем ссылки на вотчеры и реально закрываем их только тогда, когда кол-во ссылок обнуляется
 */
export class FsWatchersController {

	watchFile: ((path: string, callback: Tsc.FileWatcherCallback, pollingInterval?: number, options?: Tsc.WatchOptions) => Tsc.FileWatcher) | undefined;
	watchDirectory: ((path: string, callback: Tsc.DirectoryWatcherCallback, recursive?: boolean, options?: Tsc.WatchOptions)=> Tsc.FileWatcher) | undefined;

	private localWatchedPaths: string[] = [];

	constructor(
		private readonly context: Imploder.Context,
		private notifyFsObjectChange: (fileName: string) => void,
		private shouldTrigger: () => boolean
	){
		this.watchFile = !Tsc.sys.watchFile? undefined: this.doWatchFile.bind(this);
		this.watchDirectory = !Tsc.sys.watchDirectory? undefined: this.doWatchDirectory.bind(this);
	}

	private doWatchFile(path: string, callback: Tsc.FileWatcherCallback, pollingInterval?: number, options?: Tsc.WatchOptions): Tsc.FileWatcher{	
		if(!Tsc.sys.watchFile){
			throw new Error("No Tsc.sys.watchFile()!")
		}
		let watcher = Tsc.sys.watchFile(path, (fileName, kind) => {
			let moduleName = this.context.modulePathResolver.getCanonicalModuleName(fileName);
			if(kind === Tsc.FileWatcherEventKind.Deleted){
				// по-хорошему, удалять содержимое модуля нужно при каждом изменении, а не только при удалении
				// потому что измениться могло что угодно, и не надо бы хранить возможно устаревшие данные
				// энивей по модулю должны пройтись before/after трансформеры до того, как начнет работать бандлер
				// и эти трансформеры положат самую последнюю инфу о модуле обратно
				// на практике это не так - почему-то трансформеры иногда после изменений не отрабатывают
				// и модуль оказывается не включен в бандл
				// поэтому при остальных изменениях мы просто выкидываем js-код модуля, но не все остальное
				this.context.moduleStorage.delete(moduleName);
				this.context.transformerController.onModuleDelete(moduleName);
			} else {
				if(this.context.moduleStorage.has(moduleName)){
					let module = this.context.moduleStorage.get(moduleName);
					module.jsCode = null;
					this.context.moduleStorage.set(moduleName, module);
				}
			}
			if(this.shouldTrigger()){
				callback(fileName, kind);
				this.notifyFsObjectChange(fileName);
			}
		}, pollingInterval, options);
		if(watcher){
			// иногда watchFile/watchDirectory выдают undefined, непонятно почему
			// поэтому проверяем
			path = Path.resolve(path)
			refWatcher(path, watcher);
			this.localWatchedPaths.push(path);
		}
		return watcher;
	}

	private doWatchDirectory(path: string, callback: Tsc.DirectoryWatcherCallback, recursive?: boolean, options?: Tsc.WatchOptions):Tsc.FileWatcher {
		if(!Tsc.sys.watchDirectory){
			throw new Error("No Tsc.sys.watchDirectory()!");
		}

		let watcher = Tsc.sys.watchDirectory.call(Tsc.sys, path, (fileName: string) => {
			if(this.shouldTrigger()){
				callback(fileName);
				// не берем здесь лок, т.к. за изменением только директории не всегда следует компиляция
				// если мы возьмем здесь лок из-за изменений файлов, то потом разлочимся неизвестно когда
				//this.notifyFsObjectChange(fileName);
			}
		}, recursive, options);
		if(watcher){
			path = Path.resolve(path);
			refWatcher(path, watcher);
			this.localWatchedPaths.push(path);
		}
		return watcher;
	}

	clear(): void {
		for(let i = 0; i < this.localWatchedPaths.length; i++){
			derefWatcher(this.localWatchedPaths[i]);
		}
	}
	

}