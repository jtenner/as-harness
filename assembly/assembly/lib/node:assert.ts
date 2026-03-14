import * as strictAssert from "./node:assert/strict";

export { strictAssert as strict };
export { default } from "./node:assert/shared";
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
} from "./node:assert/shared";
