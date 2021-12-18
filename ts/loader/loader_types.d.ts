type ImploderModuleDefinitonArray = ImploderModuleDefinitonArrayMinimal | ImploderModuleDefinitonArrayShort | ImploderModuleDefinitonArrayFull
type ImploderModuleDefinitonArrayMinimal = [string, string]
type ImploderModuleDefinitonArrayShort = [string, string[], string]
type ImploderModuleDefinitonArrayFull = [string, string[], ImploderModuleLoaderData, string]

interface ImploderModuleLoaderData {
	altName?: string
	exports?: string[]
	exportRefs?: string[]
	arbitraryType?: true
	// немодульный файл = файл, который ничего не экспортирует и не импортирует
	// в таком случае, ts его не заворачивает в функцию-определение модуля
	// и запускать его нужно по особенному
	// значение nonModule вычисляется только из импортов и экспортов, однако экспорты не всегда передаются на клиент
	nonModule?: true
}