import test from "../tape";
import { TestContext } from "../tape";

export { allocateNodeIndexBuffer, discover, invoke, run } from "../exports";

test.skip("skipped test", (_context: TestContext): void => {});

test("tape parent", (context: TestContext): void => {
	context.plan(0);
	context.comment("tape parent diagnostic");
	context.teardown((teardownContext: TestContext): void => {
		teardownContext.comment("tape teardown diagnostic");
	});

	context.test("nested child", (child: TestContext): void => {
		child.plan(16);
		child.pass();
		child.skip("soft skip");
		child.ok<bool>(true);
		child.notOk<i32>(0);
		child.error<string | null>(null);
		child.equal<i32>(21, 21);
		child.notEqual<i32>(21, 22);
		child.looseEqual<string, i32>("21", 21);
		child.notLooseEqual<string, i32>("21", 22);
		child.deepEqual<Array<i32>>([1, 2], [1, 2]);
		child.notDeepEqual<Array<i32>>([1, 2], [1, 3]);
		child.same<Array<i32>>([2, 3], [2, 3]);
		child.notSame<Array<i32>>([2, 3], [2, 4]);
		child.throws((): void => {
			unreachable();
		});
		child.doesNotThrow((): void => {});
		child.ifError<string | null>(null);
		child.comment("tape nested diagnostic");
		child.end();
	});

	context.end();
});
