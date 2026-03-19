import * as strictAssert from "./strict";

export { strictAssert as strict };
export { default } from "./shared";
export { equal, notEqual } from "./legacy";
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
} from "./shared";
