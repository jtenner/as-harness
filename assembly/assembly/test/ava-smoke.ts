import test from "../ava";
import { ExecutionContext } from "../ava";

export { allocateNodeIndexBuffer, discover, invoke, run } from "../exports";

let beforeCount = 0;
let beforeEachCount = 0;
let afterEachCount = 0;
let afterAllCount = 0;

test.before((context: ExecutionContext): void => {
	beforeCount = 1;
	context.context.set("trace", "");
});

test.before.skip((_context: ExecutionContext): void => {
	beforeCount = 99;
});

test.beforeEach((context: ExecutionContext): void => {
	beforeEachCount++;
	const trace = context.context.get("trace");
	context.context.set("trace", trace + "beforeEach|" + context.title);
});

test.beforeEach.skip((_context: ExecutionContext): void => {
	beforeEachCount += 99;
});

test.afterEach((context: ExecutionContext): void => {
	afterEachCount++;
	const trace = context.context.get("trace");
	context.context.set("trace", trace + ">afterEach|" + context.title);
});

test.afterEach.skip((_context: ExecutionContext): void => {
	afterEachCount += 99;
});

test.afterEach.always((_context: ExecutionContext): void => {});

test.after((_context: ExecutionContext): void => {});

test.after.always((context: ExecutionContext): void => {
	afterAllCount = beforeEachCount;
	const trace = context.context.get("trace");
	context.context.set("trace", trace + ">after|" + context.title);
});

test.skip("skipped test", (_context: ExecutionContext): void => {});
test.todo("todo test");

test.failing("expected failure", (context: ExecutionContext): void => {
	context.is<i32>(11, 12, "ava expected failure mismatch");
});

test.serial("serial pass", (_context: ExecutionContext): void => {});

test("runs hooks and assertions", (context: ExecutionContext): void => {
	const trace = context.context.get("trace");
	context.context.set("trace", trace + ">test|" + context.title);
	context.is<string>(
		context.title,
		"runs hooks and assertions",
		"ava title mismatch",
	);
	context.is<i32>(beforeCount, 1, "before hook mismatch");
	context.true(beforeEachCount > 0, "beforeEach missing");
	context.is<i32>(
		afterEachCount + 1,
		beforeEachCount,
		"afterEach ordering mismatch",
	);
	context.is<i32>(afterAllCount, 0, "afterAll ran too early");
	context.is(
		context.context.get("trace"),
		"beforeEach|runs hooks and assertions>test|runs hooks and assertions",
		"ava trace mismatch: " + context.context.get("trace"),
	);
	context.log("ava smoke diagnostic");
});
