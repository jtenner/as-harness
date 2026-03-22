import { test, TestContext } from "../node_test";
import { equal, is, not, ok, throws, type, unreachable } from "../uvu/assert";

export { allocateNodeIndexBuffer, discover, invoke, run } from "../exports";

function failViaUnreachable(): void {
	unreachable("uvu assert smoke trap");
}

function doesNotTrap(): void {}

test("passes through uvu/assert", (context: TestContext): void => {
	ok<bool>(true);
	is<i32>(11, 11);
	is.not<i32>(11, 12);
	equal<Array<i32>>([1, 2], [1, 2]);
	type<i32>(11, "number");
	type<string>("uvu", "string");
	throws(failViaUnreachable);
	not<i32>(11, 12);
	not.equal<Array<i32>>([1, 2], [1, 3]);
	not.type<i32>(11, "string");
	not.throws(doesNotTrap);
	context.diagnostic("uvu assert smoke diagnostic");
});
