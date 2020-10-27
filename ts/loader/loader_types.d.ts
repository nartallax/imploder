type TSToolModuleDefinitonArray = TSToolModuleDefinitonArrayMinimal | TSToolModuleDefinitonArrayShort | TSToolModuleDefinitonArrayFull;
type TSToolModuleDefinitonArrayMinimal = [string, string];
type TSToolModuleDefinitonArrayShort = [string, string[], string];
type TSToolModuleDefinitonArrayFull = [string, string[], TSToolModuleLoaderData, string];

interface TSToolModuleLoaderData {
	altName?: string;
	exports?: string[];
	exportRefs?: string[];
	arbitraryType?: true;
}