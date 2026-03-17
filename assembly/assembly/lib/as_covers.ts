export enum CoverType {
	Function = 1,
	Block = 2,
	Expression = 3,
}

@external("__asCovers", "coverDeclare")
export declare function __coverDeclare(
	file: string,
	id: u32,
	line: i32,
	column: i32,
	coverType: CoverType,
): void;

@external("__asCovers", "cover")
export declare function __cover(id: u32): void;

export function __coverExpression<T>(id: u32, value: T): T {
	__cover(id);
	return value;
}
