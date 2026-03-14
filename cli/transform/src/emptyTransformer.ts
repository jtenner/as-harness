import { Transform } from "assemblyscript/dist/transform.js";
import type { Parser } from "assemblyscript/dist/assemblyscript.js";

// No-op transform used while the strict-equality transform is being designed.
export default class EmptyTransform extends Transform {
	afterParse(_parser: Parser): void {}
}
