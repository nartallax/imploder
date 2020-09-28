export type ModuleDefinitonArray = ModuleDefinitonArrayMinimal | ModuleDefinitonArrayShort | ModuleDefinitonArrayFull;
export type ModuleDefinitonArrayMinimal = [string, string];
export type ModuleDefinitonArrayShort = [string, string[], string];
export type ModuleDefinitonArrayFull = [string, string[], ModuleMetaShort, string];

export interface ModuleMetaShort {
	altName?: string;
	exports?: string[];
	exportRefs?: string[];
	arbitraryType?: true;
}