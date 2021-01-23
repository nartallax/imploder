import * as tsc from "typescript";
import * as terser from "terser";
import * as main from "imploder_main";

/** Imploder - инструмент сборки Typescript-проектов */
export namespace Imploder {

	/** Запустить тул на аргументах из командной строки */
	export const runAsCli: () => Promise<void> = main.runAsCli;
	
	/** Запустить тул, передав в него путь к tsconfig.json и какие-либо еще опции
	 * Переданные дополнительные опции имеют приоритет перед опциями в tsconfig.json
	 * Это - предпочтительный способ для запуска тула из какого-либо js/ts-кода */
	export const runFromTsconfig: (tsconfigPath: string, overrides?: Partial<Imploder.Config>) => Promise<Context> = main.runFromTsconfig;

	/** Функция для проверки на то, является ли что-либо контекстом тула
	 * Нужна для обеспечения универсальности при написании трансформеров, например */
	export const isContext: (smth: unknown) => smth is Context = main.isContext;

	/** Объект, содержащий в себе различные части тула */
	export interface Context {
		readonly config: Config;
		readonly bundler: Bundler;
		readonly compiler: Compiler;
		readonly moduleStorage: ModuleStorage;
		readonly modulePathResolver: ModulePathResolver;
		readonly transformerController: TransformerController;
		readonly logger: Logger;
	}

	/** Обертка над компилятором tsc */
	export interface Compiler {
		readonly program: tsc.Program;
		readonly compilerHost: tsc.CompilerHost;
		readonly lastBuildWasSuccessful: boolean;
		readonly lastBuildDiagnostics: ReadonlyArray<tsc.Diagnostic>;

		run(): Promise<void>;
		notifyFsObjectChange(fsObjectChangedPath: string): void;
		waitBuildEnd(): Promise<void>;
	}

	/** Класс, управляющий трансформерами */
	export interface TransformerController {
		getTransformers(): Promise<tsc.CustomTransformers>;
		onModuleDelete(moduleName: string): void;
	}
	
	/** Сборщик бандл-файла из кучи исходников */
	export interface Bundler {
		/** собрать бандл, положить в outFile, указанный в конфиге, и выдать */
		produceBundle(): Promise<string>;

		/** собрать бандл, выдать в виде строки */
		assembleBundleCode(): Promise<string>;

		/** Добавить обертки бандлера в код, этих оберток не имеющий
		 * Под такими обертками понимается лоадер и различные параметры, которые ему нужны для запуска */
		wrapBundleCode(bareBundleCode: string, otherParams?: BundlerWrapperParameters): Promise<string>;
	}

	export interface BundlerWrapperParameters {
		afterEntryPointExecuted?: string;
		entryPointArgCode?: string[];
	}	

	/** Описание профиля тула в tsconfig.json */
	export interface Profile {
		// обязательные основные параметры
		/** Путь к модулю-точке входа относительно корня проекта */
		entryModule: string;
		/** Путь к файлу, в который будет помещен бандл после сборки */
		outFile: string;

		// прочие параметры
		/** Имя функции, экспортируемой из модуля-точки входа, которая будет вызвана на старте бандла */
		entryFunction?: string;
		/** Версия ECMAScript, которой будет соответствовать полученный бандл. 
		 * Значение по умолчанию - ES5. Версии ниже ES5 не поддерживаются */
		target: keyof typeof tsc.ScriptTarget;
		/** Имя функции-обработчика ошибок запуска. Должна быть доступна в том месте, где запускается бандл */
		errorHandlerName?: string;
		/** Минифицировать ли код */
		minify: boolean;
		/** Включить ли tslib в бандл, если он требуется каким-либо модулем
		 * По умолчанию true.*/
		embedTslib?: boolean;
		/** Не удалять директорию с выходными js-файлами.
		 * По умолчанию, при запуске тул удаляет эту директорию ради консистентности билдов. */
		preserveOutDir?: boolean;
		/** Массив с регекспами.
		 * Если в бандл включен модуль, имя которого подходит под хотя бы один из этих регекспов - сборка завершится неудачей */
		moduleBlacklistRegexp?: string[];
		/** Массив с регекспами.
		 * Если он задан и не пуст - имя каждого модуля, включаемого в бандл, обязано подходить хотя бы под один из них */
		moduleWhitelistRegexp?: string[];

		/** Опции-переопределения для минификации
		 * Передача некоторых из них, возможно, сломает тул */
		minificationOverrides?: Partial<terser.CompressOptions>;

		/** Список трансформеров, применяемых к проекту */
		transformers?: TransformerReference[];

		// watchmode
		/** Запуститься в watch-моде. Отслеживать изменения в файлах и перекомпилировать сразу же. */
		watchMode?: boolean;
		/** Если указан этот порт - то тул запустит локальный http-сервер, который будет ожидать команд, на указанном порту.
		 * Удобно при разработке. Работает только в watch-моде. */
		httpPort?: number;
		/** Показывать ли ошибки при провале сборки, если сборка запущена через HTTP?
		 * По умолчанию показ ошибок через HTTP отключен из соображений безопасности */
		showErrorsOverHttp?: boolean;

		// отладочные опции
		/** Выдавать ли больше логов в stderr */
		verbose?: boolean;
		/** Не выдавать логи про ошибки и прочие диагностические сообщения процесса компиляции */
		noBuildDiagnosticMessages?: boolean;
		/** Не включать код загрузчика в бандл, и сопутствующие ему обертки.
		 * Если включено, бандл будет состоять только из кода модулей. */
		noLoaderCode?: boolean;
	}

	/** Содержимое блока imploderConfig внутри tsconfig.json */
	export interface TsconfigInclusion extends Profile {
		profiles?: { [profileName: string]: Imploder.Profile }
	}

	export interface TransformerFromImploderProject { imploderProject: string }
	export interface TransformerFromImploderBundle { imploderBundle: string }
	export type TransformerReference = TransformerFromImploderProject | TransformerFromImploderBundle;

	/** Конфиг всего тула в целом */
	export interface Config extends CLIArgs, Profile { 
		tscParsedCommandLine: tsc.ParsedCommandLine;
		/** Эта опция здесь для того, чтобы её можно было переопределить при запуске из js-кода (т.е. не как CLI-тул)
		 * Возможности передать значение этой опции через конфиг/CLI нет */
		writeLogLine?: (logLine: string) => void;
	}

	/** Опции, которые можно передать тулу через командную строку */
	export interface CLIArgs {
		tsconfigPath: string;
		verbose?: boolean;
		help?: boolean;
		test?: boolean;
		testSingle?: string;
		profile?: string;
	}

	/** Класс, умеющий работать с именами модулей и путями к файлам, относящимся к этим модулям */
	export interface ModulePathResolver {
		/** если moduleDesignator указывает на модуль-файл - получить правильное имя модуля; иначе оставить его как есть */ 
		resolveModuleDesignator(moduleDesignator: string, sourceFile: string): string;
	
		/** привести имя файла-модуля проекта к каноничному виду */
		getCanonicalModuleName(localModuleNameOrPath: string): string;
	}

	/** Хранилище всякой информации о модулях */
	export interface ModuleStorage {
		set(name: string, data: ModuleData): void;
		get(name: string): ModuleData;
		delete(name: string): void;
		has(name: string): boolean;
		getKnownModuleNames(): string[];
	}

	/** Объект, описывающий один модуль */
	export interface ModuleData {
		/** Множество имен модулей, от которых зависит данный (как amd-зависимости)
		* Идут в той же последовательности, что и аргументы функции, определяющей этот модуль */
		dependencies: string[];

		/** Имеет ли этот модуль хотя бы один импорт или экспорт
		* если не имеет - то модуль считается за не-amd модуль (и вообще, строго говоря, не за модуль)
		* и к нему применяются несколько другие правила */
		hasImportOrExport: boolean;

		/** Множество имен экспортируемых значений */
		exports: string[];

		/** Модуль имеет конструкцию вида "export = "
		* принципиально тут то, что такой модуль может быть запрошен строго через require(), т.к. его результат может быть не объектом
		* (см. конструкцию вида import someName = require("my_module") )
		* т.о. ничто другое, кроме самого результата выполнения модуля, подставлено в качестве результата быть не может */
		hasOmniousExport: boolean;

		/** Множество имен модулей, которые данный экспортирует через export * from "other_module_name" */
		exportModuleReferences: string[];
		
		/** Альтернативное имя, по которому доступен данный модуль */
		altName: string | null;

		/** Код модуля после компиляции */
		jsCode: string | null;
	}

	/** Кастомный трансформер
	 * Немного отличается по смыслу от объекта tsc.CustomTransformer
	 * Например, tsc.CustomTransformer создается каждый раз, когда он нужен; этот объект создается при старте тула один раз */
	export interface CustomTransformerDefinition {
		/** Имя трансформера. Используется при отладочных выводах, а также при построении последовательности запуска трансформеров */
		readonly transformerName: string;

		// опции про контроль порядка запуска трансформеров
		// в launchAfter перечисляются имена трансформеров, которые должны быть запущены строго ранее этого
		// launchAfterRequired - то же самое, но при этом отсутствие такого трансформера - ошибка (в launchAfter - нет)
		// при прочих равных трансформеры сортируются по именам
		readonly launchAfter?: string[];
		readonly launchAfterRequired?: string[];
		
		/** Создать инстанс трансформера, который будет запускаться до транспиляции typescript кода в javascript */
		createForBefore?(transformContext: tsc.TransformationContext): tsc.CustomTransformer;

		/** Создать инстанс трансформера, который будет запускаться после транспиляции typescript кода в javascript */
		createForAfter?(transformContext: tsc.TransformationContext): tsc.CustomTransformer;

		/** Обработать удаление модуля */
		onModuleDelete?(moduleName: string): void;
	}

	type PromiseOrValue<T> = T | Promise<T>;
	type ArrayOrSingleValue<T> = T | T[];
	export type TransformerProjectEntryPointReturnType = PromiseOrValue<ArrayOrSingleValue<CustomTransformerDefinition>>

	/** Под эту сигнатуру должен подходить энтрипоинт проекта, указанного как проект трансформера */
	export type TransformerCreationFunction = (context: Context) => TransformerProjectEntryPointReturnType

	/** Объект, который управляет логами */
	export interface Logger {
		errorAndExit(msg: string): never;
		error(msg: string): void;
		warn(msg: string): void;
		info(msg: string): void;
		debug(msg: string): void;
	}

}