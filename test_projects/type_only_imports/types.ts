export interface MyObj {
	x: number;
	y: number;
}

export type MyType<X> = Map<X, X> | Set<X>;