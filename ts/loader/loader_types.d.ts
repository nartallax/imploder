type ImploderModuleDefinitonArray = ImploderModuleDefinitonArrayMinimal | ImploderModuleDefinitonArrayShort | ImploderModuleDefinitonArrayFull;
type ImploderModuleDefinitonArrayMinimal = [string, string];
type ImploderModuleDefinitonArrayShort = [string, string[], string];
type ImploderModuleDefinitonArrayFull = [string, string[], ImploderModuleLoaderData, string];

interface ImploderModuleLoaderData {
	altName?: string;
	exports?: string[];
	exportRefs?: string[];
	arbitraryType?: true;
}