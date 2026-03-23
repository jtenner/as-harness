import test from "../ava";
import { ExecutionContext } from "../ava";

export { allocateNodeIndexBuffer, discover, invoke, run } from "../exports";

let beforeCount = 0;
let beforeEachCount = 0;
let afterEachCount = 0;
let afterAllCount = 0;

test.before((_context: ExecutionContext): void => {
	beforeCount = 1;
});

test.before.skip((_context: ExecutionContext): void => {
	beforeCount = 99;
});

test.beforeEach((_context: ExecutionContext): void => {
	beforeEachCount++;
});

test.beforeEach.skip((_context: ExecutionContext): void => {
	beforeEachCount += 99;
});

test.afterEach((_context: ExecutionContext): void => {
	afterEachCount++;
});

test.afterEach.skip((_context: ExecutionContext): void => {
	afterEachCount += 99;
});

test.afterEach.always((_context: ExecutionContext): void => {});

test.after((_context: ExecutionContext): void => {});

test.after.always((_context: ExecutionContext): void => {
	afterAllCount = beforeEachCount;
});

test.skip("skipped test", (_context: ExecutionContext): void => {});
test.todo("todo test");

test.failing("expected failure", (context: ExecutionContext): void => {
	context.assert.strictEqual<i32>(11, 12, "ava expected failure mismatch");
});

test.serial("serial pass", (_context: ExecutionContext): void => {});

test("runs hooks and assertions", (context: ExecutionContext): void => {
	context.assert.strictEqual<i32>(beforeCount, 1, "before hook mismatch");
	context.assert.strictEqual<bool>(
		beforeEachCount > 0,
		true,
		"beforeEach missing",
	);
	context.assert.strictEqual<i32>(
		afterEachCount + 1,
		beforeEachCount,
		"afterEach ordering mismatch",
	);
	context.assert.strictEqual<i32>(afterAllCount, 0, "afterAll ran too early");
	context.diagnostic("ava smoke diagnostic");
});
