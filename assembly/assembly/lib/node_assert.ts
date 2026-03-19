import * as strictAssert from "./node_assert/strict";

export { strictAssert as strict };
export { default } from "./node_assert/shared";
export { equal, notEqual } from "./node_assert/legacy";
export {
	deepStrictEqual,
	doesNotThrow,
	fail,
	ifError,
	notDeepStrictEqual,
	notStrictEqual,
	ok,
	strictEqual,
	throws,
} from "./node_assert/shared";
