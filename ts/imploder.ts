import * as Tsc from "typescript"
import * as Terser from "terser"
import * as main from "imploder_main"
import {ExternalInstanceImpl} from "impl/external_instance"

/** Imploder - инструмент сборки Typescript-проектов */
export namespace Imploder {

	/** Запустить тул на аргументах из командной строки */
	export const runAsCli: () => Promise<void> = main.runAsCli

	/** Запустить тул, передав в него путь к tsconfig.json и какие-либо еще опции
	 * Переданные дополнительные опции имеют приоритет перед опциями в tsconfig.json
	 * Это - предпочтительный способ для запуска тула из какого-либо js/ts-кода */
	export const runFromTsconfig: (tsconfigPath: string, overrides?: Partial<Config>) => Promise<Context> = main.runFromTsconfig

	/** Распарсить конфиг, не запуская тул */
	export const parseConfig: (tsconfigPath: string, overrides?: Partial<Config>) => Promise<Config> = async(path, overrides) => main.updatePartialConfigWithTsconfig(path, overrides)
	export const parseConfigSync: (tsconfigPath: string, overrides?: Partial<Config>) => Config = (path, overrides) => main.updatePartialConfigWithTsconfig(path, overrides)

	/** Создать интерфейс к другому инстансу тула на этой же машине (localhost) */
	export const externalInstance: (config: Config) => ExternalInstance = config => new ExternalInstanceImpl(config)

	/** Функция для проверки на то, является ли что-либо контекстом тула
	 * Нужна для обеспечения универсальности при написании трансформеров, например */
	export const isContext: (smth: unknown) => smth is Context = main.isContext

	/** Объект, содержащий в себе различные части тула */
	export interface Context {
		readonly config: Config
		readonly bundler: Bundler
		readonly compiler: Compiler
		readonly moduleStorage: ModuleStorage
		readonly modulePathResolver: ModulePathResolver
		readonly transformerController: TransformerController
		readonly httpApi: HttpApi | null
		readonly logger: Logger
		readonly stdoutNotificator: StdoutNotificator

		stopEverything(): Promise<void>
	}

	/** Обертка над компилятором tsc */
	export interface Compiler {
		/** Запущен ли компилятор на самом деле?
		 * В некоторых случаях (см. lazyStart) существование инстанса Compiler не гарантирует старта tsc
		 * И это может приводить к ошибкамз
		 * Например, если попытаться собрать бандл, не проверив, отработал ли компилятор хоть раз */
		readonly isStarted: boolean
		readonly program: Tsc.Program
		readonly compilerHost: Tsc.CompilerHost
		readonly lastBuildWasSuccessful: boolean
		readonly lastBuildDiagnostics: ReadonlyArray<Tsc.Diagnostic>
		readonly projectRoot: string

		run(): Promise<void>
		stop(): void | Promise<void>
		notifyFsObjectChange(fsObjectChangedPath: string): void
		waitBuildEnd(): Promise<void>
		/** Имеет смысл вызывать в процессе компиляции, например, из трансформеров.
		 * Добавление ошибки приведет к провалу компиляции.
		 * Альтернативный способ остановить компиляцию - выбросить ошибку из трасформера,
		 * но это не так удобно, т.к. не позволяет указывать на конкретную строку в */
		addDiagnostic(diag: Tsc.Diagnostic): void
	}

	/** Класс, управляющий трансформерами */
	export interface TransformerController {
		createTransformers(onError: TransformerErrorHandler): Promise<Tsc.CustomTransformers>
		onModuleDelete(moduleName: string): void
	}

	/** Обработчик ошибок, выдаваемых трансформаторами */
	export type TransformerErrorHandler = (e: Error, ref: TransformerReference, file: Tsc.SourceFile | Tsc.Bundle) => void

	/** Сборщик бандл-файла из кучи исходников */
	export interface Bundler {
		/** собрать бандл, положить в outFile, указанный в конфиге, и выдать */
		produceBundle(): Promise<string>

		/** собрать бандл, выдать в виде строки */
		assembleBundleCode(): Promise<string>

		/** Добавить обертки бандлера в код, этих оберток не имеющий
		 * Под такими обертками понимается лоадер и различные параметры, которые ему нужны для запуска */
		wrapBundleCode(bareBundleCode: string, otherParams?: BundlerWrapperParameters): Promise<string>
	}

	export interface BundlerWrapperParameters {
		entryPointArgCode?: string[]
	}

	/** Описание профиля тула в tsconfig.json */
	export interface Profile {
		// обязательные основные параметры
		/** Путь к модулю-точке входа относительно корня проекта */
		entryModule: string
		/** Путь к файлу, в который будет помещен бандл после сборки */
		outFile: string

		// прочие параметры
		/** Имя функции, экспортируемой из модуля-точки входа, которая будет вызвана на старте бандла */
		entryFunction?: string
		/** Версия ECMAScript, которой будет соответствовать полученный бандл.
		 * Значение по умолчанию - ES5. Версии ниже ES5 не поддерживаются */
		target: keyof typeof Tsc.ScriptTarget
		/** Имя функции-обработчика ошибок запуска. Должна быть доступна в том месте, где запускается бандл */
		errorHandlerName?: string
		/** Минифицировать ли код */
		minify: boolean
		/** Включить ли tslib в бандл, если он требуется каким-либо модулем
		 * По умолчанию true.*/
		embedTslib?: boolean
		/** Не удалять директорию с выходными js-файлами.
		 * По умолчанию, при запуске тул удаляет эту директорию ради консистентности билдов. */
		preserveOutDir?: boolean
		/** Не выкидывать модули из дерева модулей
		 * По умолчанию, тул не кладет в бандл те модули, на значения которых нет ссылки с точки входа.
		 * Если эта опция = true, то в бандл будут попадать все модули, на которых отработал компилятор
		 * Имеет смысл включать, если в большом количестве модулей есть какие-либо действия с сайд-эффектами
		 * Включение этой опции не добавит в бандл модули, попадающие в блеклисты/не попадающие в вайтлисты */
		preventModuleTreePruning?: boolean
		/** Массив с регекспами.
		 * Если в бандл включен модуль, имя которого подходит под хотя бы один из этих регекспов - сборка завершится неудачей */
		moduleBlacklistRegexp?: string[]
		/** Массив с регекспами.
		 * Если он задан и не пуст - имя каждого модуля, включаемого в бандл, обязано подходить хотя бы под один из них */
		moduleWhitelistRegexp?: string[]

		/** Опции-переопределения для минификации
		 * Передача некоторых из них, возможно, сломает тул */
		minificationOverrides?: Partial<Terser.CompressOptions>

		/** Список трансформеров, применяемых к проекту
		 * Будут добавлены в конец списка плагинов в compilerOptions */
		plugins?: TransformerReference[]

		// watchmode
		/** Запуститься в watch-моде. Отслеживать изменения в файлах и перекомпилировать сразу же. */
		watchMode?: boolean
		/** Если указан этот порт - то тул запустит локальный http-сервер, который будет ожидать команд, на указанном порту.
		 * Удобно при разработке. Работает только в watch-моде. */
		httpPort?: number
		/** Показывать ли ошибки при провале сборки, если сборка запущена через HTTP?
		 * По умолчанию показ ошибок через HTTP отключен из соображений безопасности */
		showErrorsOverHttp?: boolean
		/** Если true - не запускать компиляцию, пока она не понадобится */
		lazyStart?: boolean

		// отладочные опции
		/** Выдавать ли больше логов в stderr */
		verbose?: boolean
		/** Не выдавать логи про ошибки и прочие диагностические сообщения процесса компиляции */
		noBuildDiagnosticMessages?: boolean
		/** Не включать код загрузчика в бандл, и сопутствующие ему обертки.
		 * Если включено, бандл будет состоять только из кода модулей. */
		noLoaderCode?: boolean
	}

	/** Содержимое блока imploderConfig внутри tsconfig.json */
	export interface TsconfigInclusion extends Profile {
		profiles?: {[profileName: string]: Imploder.Profile}
	}

	/** Конфиг всего тула в целом */
	export interface Config extends CLIArgs, Profile {
		tscParsedCommandLine: Tsc.ParsedCommandLine
		/** Эта опция здесь для того, чтобы её можно было переопределить при запуске из js-кода (т.е. не как CLI-тул)
		 * Возможности передать значение этой опции через конфиг/CLI нет */
		writeLogLine?(logLine: string): void
	}

	/** Опции, которые можно передать тулу через командную строку */
	export interface CLIArgs {
		tsconfigPath: string
		verbose?: boolean
		help?: boolean
		test?: boolean
		testSingle?: string
		profile?: string
		plainLogs?: boolean
		stdoutNotifications?: boolean
		idleTimeout?: number
	}

	/** JSON-объект, который может быть выдан в stdout */
	export interface StdoutNotification {
		type: "started"
	}

	/** Класс, умеющий работать с именами модулей и путями к файлам, относящимся к этим модулям */
	export interface ModulePathResolver {
		/** если moduleDesignator указывает на модуль-файл - получить правильное имя модуля; иначе оставить его как есть */
		resolveModuleDesignator(moduleDesignator: string, sourceFile: string): string

		/** привести имя файла-модуля проекта к каноничному виду */
		getCanonicalModuleName(localModuleNameOrPath: string): string

		/** Если path ведет в node_modules - получить имя npm-пакета и каноничный путь */
		getExternalPackageNameAndPath(path: string): {packageName: string, filePathInPackage: string} | null
	}

	/** Хранилище всякой информации о модулях */
	export interface ModuleStorage {
		set(name: string, data: ModuleData): void
		get(name: string): ModuleData
		delete(name: string): void
		has(name: string): boolean
		getKnownModuleNames(): string[]
	}

	/** Объект, описывающий один модуль */
	export interface ModuleData {
		/** Множество имен модулей, от которых зависит данный (как amd-зависимости)
		* Идут в той же последовательности, что и аргументы функции, определяющей этот модуль */
		dependencies: string[]

		/** Является ли этот файл полноценным модулем
		 * (имеет хотя бы один импорт или экспорт)
		 * Если нет - то он будет скомпилирован особым образом
		 * И его нужно обрабатывать в дальнейшем немного по-другому, чем обычные модульные файлы */
		isModuleFile: boolean

		/** Множество имен экспортируемых значений */
		exports: string[]

		/** Модуль имеет конструкцию вида "export = "
		* принципиально тут то, что такой модуль может быть запрошен строго через require(), т.к. его результат может быть не объектом
		* (см. конструкцию вида import someName = require("my_module") )
		* т.о. ничто другое, кроме самого результата выполнения модуля, подставлено в качестве результата быть не может */
		hasOmniousExport: boolean

		/** Множество имен модулей, которые данный экспортирует через export * from "other_module_name" */
		exportModuleReferences: string[]

		/** Альтернативное имя, по которому доступен данный модуль */
		altName: string | null

		/** Код модуля после компиляции */
		jsCode: string | null
	}

	// based on https://github.com/cevek/ttypescript
	/** Описание трансформера в конфиге */
	export interface TransformerReference {
		/** Имя модуля трансформера, или путь к нему */
		transform?: string

		/** Имя экспортируемого значения-трансформатора */
		import?: string

		/** Что подавать на вход трансформеру? */
		type?: "program" | "config" | "checker" | "raw" | "compilerOptions" | "imploder"

		/** transform указывает на tsconfig.json другого Imploder-проекта, который нужно сначала собрать? */
		imploderProject?: boolean

		/** Запускать этот трансформер на js-коде (после его генерации из ts)? */
		after?: boolean

		/** Запускать этот трансформер в фазу afterDeclarations? */
		afterDeclarations?: boolean

		/** Какие-нибудь еще параметры конфигурации */
		[options: string]: unknown

		/** Определяет порядок, в котором будут исполняться трансформеры относительно друг друга.
		 * Сначала будут исполнены трансформеры с меньшим значением этого поля (т.е. 1, 2, 3...)
		 * Если не указан, то равен Number.MAX_SAFE_INTEGER (т.е. исполняется в конце списка).
		 * При прочих равных первыми исполняются трансформеры, указанные в списке раньше
		 * Трансформеры, добавляемые в профилях, подключаются позже трансформеров, указанных в основной части конфига */
		transformerExecutionOrder?: number
	}

	/** Кастомный трансформер
	 * Немного отличается по смыслу от объекта tsc.CustomTransformer
	 * Например, tsc.CustomTransformer создается каждый раз, когда он нужен; этот объект создается при старте тула один раз */
	export interface CustomTransformerFactory {
		(context: Tsc.TransformationContext): (sourceFile: Tsc.SourceFile) => Tsc.SourceFile
		/** Обработать удаление модуля */
		onModuleDelete?(moduleName: string): void
	}

	/** Объект, который управляет логами */
	export interface Logger {
		errorAndExit(msg: string): never
		error(msg: string): void
		warn(msg: string): void
		info(msg: string): void
		debug(msg: string): void
	}

	/** Объект, выдающий оповещения в stdout */
	export interface StdoutNotificator {
		started(): void
	}

	/** Инстанс тула, запущенный на этой же машине, доступный через хттп */
	export interface ExternalInstance {
		assembleBundle(): Promise<string>
		assembleBundleErrorsOnly(): Promise<void>
		assembleBundleSilent(): Promise<void>
	}

	/** Вебсервер тула, принимающий команды */
	export interface HttpApi {
		start(): Promise<void>
		stop(): Promise<void>
	}

}