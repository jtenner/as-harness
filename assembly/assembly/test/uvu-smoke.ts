import { equal, is, not, ok, unreachable } from "../uvu/assert";
import { exec, suite, test, TestContext } from "../uvu";

export { allocateNodeIndexBuffer, discover, invoke, run } from "../exports";

let rootBeforeEachCount = 0;
let rootAfterEachCount = 0;
let suiteBeforeCount = 0;
let suiteBeforeEachCount = 0;
let suiteAfterEachCount = 0;
let suiteAfterCount = 0;

function trapViaUnreachable(): void {
	unreachable("uvu smoke trap");
}

test.before((_context: TestContext): void => {});

test.before.each((_context: TestContext): void => {
	_context.assert.strictEqual<string>(
		_context.__suite__,
		"uvu adapter",
		"root beforeEach suite crumb mismatch",
	);
	_context.assert.strictEqual<string>(
		_context.__test__,
		"focused child",
		"root beforeEach test crumb mismatch",
	);
	rootBeforeEachCount++;
});

test.after.each((_context: TestContext): void => {
	_context.assert.strictEqual<string>(
		_context.__suite__,
		"uvu adapter",
		"root afterEach suite crumb mismatch",
	);
	_context.assert.strictEqual<string>(
		_context.__test__,
		"focused child",
		"root afterEach test crumb mismatch",
	);
	rootAfterEachCount++;
});

test.after((_context: TestContext): void => {});

test.inBand();
test.inBand(false);
test.bail();
test.continueOnFailure();
exec(false);

const adapterSuite = suite("uvu adapter");
adapterSuite.inBand();
adapterSuite.bail();
adapterSuite.continueOnFailure();

adapterSuite.before((_context: TestContext): void => {
	_context.assert.strictEqual<string>(
		_context.__suite__,
		"uvu adapter",
		"suite before crumb mismatch",
	);
	_context.assert.strictEqual<string>(
		_context.__test__,
		"focused child",
		"suite before test crumb mismatch",
	);
	suiteBeforeCount++;
});

adapterSuite.beforeEach((_context: TestContext): void => {
	_context.assert.strictEqual<string>(
		_context.__suite__,
		"uvu adapter",
		"suite beforeEach crumb mismatch",
	);
	_context.assert.strictEqual<string>(
		_context.__test__,
		"focused child",
		"suite beforeEach test crumb mismatch",
	);
	suiteBeforeEachCount++;
});

adapterSuite.afterEach((_context: TestContext): void => {
	_context.assert.strictEqual<string>(
		_context.__suite__,
		"uvu adapter",
		"suite afterEach crumb mismatch",
	);
	_context.assert.strictEqual<string>(
		_context.__test__,
		"focused child",
		"suite afterEach test crumb mismatch",
	);
	suiteAfterEachCount++;
});

adapterSuite.after((_context: TestContext): void => {
	_context.assert.strictEqual<string>(
		_context.__suite__,
		"uvu adapter",
		"suite after crumb mismatch",
	);
	_context.assert.strictEqual<string>(
		_context.__test__,
		"focused child",
		"suite after test crumb mismatch",
	);
	suiteAfterCount = suiteBeforeEachCount;
});

adapterSuite.skip("skipped child", (_context: TestContext): void => {
	trapViaUnreachable();
});

adapterSuite.only("focused child", (context: TestContext): void => {
	context.assert.strictEqual<string>(
		context.__suite__,
		"uvu adapter",
		"focused child suite crumb mismatch",
	);
	context.assert.strictEqual<string>(
		context.__test__,
		"focused child",
		"focused child test crumb mismatch",
	);
	context.assert.strictEqual<bool>(
		rootBeforeEachCount > 0,
		true,
		"root beforeEach missing",
	);
	context.assert.strictEqual<i32>(
		rootAfterEachCount + 1,
		rootBeforeEachCount,
		"root afterEach ordering mismatch",
	);
	context.assert.strictEqual<i32>(suiteBeforeCount, 1, "suite before mismatch");
	context.assert.strictEqual<bool>(
		suiteBeforeEachCount > 0,
		true,
		"suite beforeEach missing",
	);
	context.assert.strictEqual<i32>(
		suiteAfterEachCount + 1,
		suiteBeforeEachCount,
		"suite afterEach ordering mismatch",
	);
	context.assert.strictEqual<i32>(
		suiteAfterCount,
		0,
		"suite after ran too early",
	);
	ok<bool>(true);
	is<i32>(21, 21);
	is.not<i32>(21, 22);
	equal<Array<i32>>([1, 2], [1, 2]);
	not<i32>(21, 22);
	not.equal<Array<i32>>([1, 2], [1, 3]);
	context.assert.throws(trapViaUnreachable);
	context.diagnostic("uvu smoke diagnostic");
});

adapterSuite.run();
exec(false);
