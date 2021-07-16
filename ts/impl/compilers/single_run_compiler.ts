import {Imploder} from "imploder";
import {ImploderWatchCompiler} from "impl/compilers/watch_compiler";


export class ImploderSingleRunCompiler extends ImploderWatchCompiler implements Imploder.Compiler {
	protected shouldInstallFsWatchers(): boolean {
		return false;
	}

	async run(): Promise<void> {
		// да, в итоге оказалось проще имплементировать одиночную компиляцию через watch-компиляцию
		// это дает более консистентные результаты
		do {
			// зачем в цикле?
			// это позволяет поддерживать трансформеры, которые генерируют код
			// т.о. в первый цикл трансформер генерирует файл и дергает за notifyFsObjectChange
			// мы это видим по тому, что buildLock не снят
			// и запускаем сборку по новой
			await super.run();
			this.stop();
		} while(this.buildLock.isLocked());
	}

}