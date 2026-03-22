import {
	after,
	afterEach,
	before,
	beforeEach,
	context,
	describe,
	it,
	specify,
	TestContext,
	xcontext,
	xdescribe,
	xit,
	xspecify,
} from "../mocha";

export { allocateNodeIndexBuffer, discover, invoke, run } from "../exports";

let suiteSetupCount = 0;
let beforeEachCount = 0;
let afterEachCount = 0;
let afterAllCount = 0;

before((_context: TestContext): void => {
	suiteSetupCount = 1;
});

beforeEach((_context: TestContext): void => {
	beforeEachCount++;
});

afterEach((_context: TestContext): void => {
	afterEachCount++;
});

after((_context: TestContext): void => {
	afterAllCount = beforeEachCount;
});

describe("mocha adapter", (_context): void => {
	xdescribe("xdescribe branch", (_nestedContext): void => {
		it("nested xdescribe child", (_context: TestContext): void => {});
	});

	xcontext("xcontext branch", (_nestedContext): void => {
		specify("nested xcontext child", (_context: TestContext): void => {});
	});

	xit("xit leaf", (_context: TestContext): void => {});
	xspecify("xspecify leaf", (_context: TestContext): void => {});

	context("context alias", (_nestedContext): void => {
		it("nested context child", (_context: TestContext): void => {});
	});

	it("top-level pass", (_context: TestContext): void => {});
	it("implicit pending");

	specify("runs hooks and assertions", (context: TestContext): void => {
		context.assert.strictEqual<i32>(suiteSetupCount, 1, "suite setup mismatch");
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
		context.assert.strictEqual<i32>(afterAllCount, 0, "after ran too early");
		context.diagnostic("mocha smoke diagnostic");
	});
});
