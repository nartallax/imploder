import {TSToolContext} from "impl/context";
import * as tsc from "typescript";

/** Некий трансформер, определяемый пользователем.
 * Заметьте, что это интерфейс определения класса. */
export interface CustomTransformerDefinition {
	new(context: TSToolContext): CustomTransformer;

	/** Имя трансформера. Используется при отладочных выводах, а также при построении последовательности запуска трансформеров */
	readonly transformerName: string;
	/** Список трансформеров, которые должны запускаться строго перед этим трансформером
	 * Трансформеры, порядок которых определить однозначно не удается, будут запущены после остальных 
	 * (При прочих равных запускаются трансформеры с меньшим name) */
	readonly launchAfter?: string[];
}

export interface CustomTransformer {
	/** На какой стадии запускать трансформер - до компиляции ts в js (before) или после (after)
	 * По умолчанию - before */
	readonly stage?: "before" | "after"

	/** Запустить трансформер на указанном sourceFile */
	run(file: tsc.SourceFile): tsc.SourceFile;

	/** Обработать удаление файла */
	onFileDelete(path: string): void;
}