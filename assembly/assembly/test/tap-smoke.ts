import tap from "../tap";
import { after, afterEach, before, beforeEach, test, Test } from "../tap";

export { allocateNodeIndexBuffer, discover, invoke, run } from "../exports";

let rootBeforeCount = 0;
let rootAfterCount = 0;

before((_context: Test): void => {
	rootBeforeCount = 1;
});

beforeEach((context: Test): void => {
	context.comment("tap root beforeEach|" + context.name);
});

afterEach((context: Test): void => {
	context.comment("tap root afterEach|" + context.name);
});

after((_context: Test): void => {
	rootAfterCount = rootBeforeCount;
});

tap.skip("skipped tap test", (_context: Test): void => {});
tap.todo("todo tap test", (_context: Test): void => {});

test("tap parent", (context: Test): void => {
	context.plan(2, "tap parent plan");
	context.comment("tap parent diagnostic");
	context.before((hookContext: Test): void => {
		hookContext.comment("tap nested before|" + hookContext.name);
	});
	context.after((hookContext: Test): void => {
		hookContext.comment("tap nested after|" + hookContext.name);
	});
	context.beforeEach((hookContext: Test): void => {
		hookContext.comment("tap nested beforeEach|" + hookContext.name);
	});
	context.afterEach((hookContext: Test): void => {
		hookContext.comment("tap nested afterEach|" + hookContext.name);
	});

	context.test("nested child", (child: Test): void => {
		child.plan(13, "tap child plan");
		child.pass("tap child pass");
		child.ok<bool>(true);
		child.notOk<i32>(0);
		child.equal<i32>(child.count, 3);
		child.not<i32>(11, 12);
		child.same<Array<i32>>([1, 2], [1, 2]);
		child.notSame<Array<i32>>([1, 2], [1, 3]);
		child.strictSame<Array<i32>>([2, 3], [2, 3]);
		child.strictNotSame<Array<i32>>([2, 3], [2, 4]);
		child.throws((): void => {
			unreachable();
		});
		child.doesNotThrow((): void => {});
		child.type<string>("tap", "string");
		child.error<string | null>(null);
		child.end();
	});

	context.equal<i32>(rootAfterCount, 0, "tap root after ran too early");
	context.pass();
	context.end();
});
