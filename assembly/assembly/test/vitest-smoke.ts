import {
	afterEach,
	assertType,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	suite,
	test,
	TestContext,
} from "../vitest";

export { allocateNodeIndexBuffer, discover, invoke, run } from "../exports";

let beforeEachCount = 0;
let afterEachCount = 0;
let suiteSetupCount = 0;

function shouldNeverExecuteSkippedSuite(): void {
	unreachable();
}

function throwsUnreachable(): void {
	unreachable();
}

const strictArrayNeedle = [2, 3];
const strictArrayHaystack = [strictArrayNeedle, [4, 5]];

beforeAll((_context: TestContext): void => {
	suiteSetupCount = 1;
});

beforeEach((_context: TestContext): void => {
	beforeEachCount++;
});

afterEach((_context: TestContext): void => {
	afterEachCount++;
});

describe("vitest adapter", (_context): void => {
	suite.skipIf(true)("skipped suite", (_nestedContext): void => {
		shouldNeverExecuteSkippedSuite();
	});

	test.fails("expected failure metadata", (context: TestContext): void => {
		context.assert.strictEqual<i32>(31, 32, "vitest expected failure mismatch");
	});
	test("implicit todo metadata");
	test.sequential("sequential pass", (_context: TestContext): void => {});
	it.sequential("sequential it pass", (_context: TestContext): void => {});
	suite.sequential("sequential suite alias", (_nestedContext): void => {
		test("nested suite alias child", (_context: TestContext): void => {});
	});
	describe.sequential("sequential suite", (_nestedContext): void => {
		test("nested sequential child", (_context: TestContext): void => {});
	});
	test.skipIf(false)("conditional pass", (_context: TestContext): void => {});

	it("runs hooks and assertions", (context: TestContext): void => {
		assertType<i32>(suiteSetupCount);
		expect<i32>(suiteSetupCount).toBe(1);
		expect<i32>(beforeEachCount).toBeGreaterThan(0);
		expect<Array<Array<i32>>>(strictArrayHaystack).toContain(strictArrayNeedle);
		expect<Array<Array<i32>>>(strictArrayHaystack).toContainEqual([2, 3]);
		expect<Array<i32>>([1, 2, 3]).toHaveLength(3);
		expect<i32>(5).toBeGreaterThan(4);
		expect<i32>(4).toBeLessThan(5);
		expect<f64>(NaN).toBeNaN();
		expect<() => void>(throwsUnreachable).toThrow();
		context.diagnostic("vitest smoke diagnostic");
	});
});
