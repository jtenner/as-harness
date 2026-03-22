import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	fail,
	it,
	TestContext,
	xdescribe,
	xit,
} from "../jasmine";

export { allocateNodeIndexBuffer, discover, invoke, run } from "../exports";

let suiteSetupCount = 0;
let beforeEachCount = 0;
let afterEachCount = 0;
let afterAllCount = 0;

function failImmediately(): void {
	fail("jasmine fail");
}

beforeAll((_context: TestContext): void => {
	suiteSetupCount = 1;
});

beforeEach((_context: TestContext): void => {
	beforeEachCount++;
});

afterEach((_context: TestContext): void => {
	afterEachCount++;
});

afterAll((_context: TestContext): void => {
	afterAllCount = beforeEachCount;
});

describe("jasmine adapter", (_context): void => {
	xdescribe("xdescribe branch", (_nestedContext): void => {
		it("nested xdescribe child", (_context: TestContext): void => {});
	});

	xit("xit leaf", (_context: TestContext): void => {});
	it("implicit pending");
	it("plain pass", (_context: TestContext): void => {});

	it("runs hooks and matchers", (context: TestContext): void => {
		const maybeNothing = <string | null>null;

		expect<i32>(suiteSetupCount).toBe(1);
		expect<i32>(beforeEachCount).toBeGreaterThan(0);
		expect<i32>(afterEachCount + 1).toBe(beforeEachCount);
		expect<i32>(afterAllCount).toBe(0);
		expect<Array<i32>>([1, 2, 3]).toEqual([1, 2, 3]);
		expect<Array<i32>>([1, 2, 3]).toContain(2);
		expect<string | null>("value").toBeDefined();
		expect<bool>(false).toBeFalsy();
		expect<bool>(true).toBeTruthy();
		expect<string | null>(maybeNothing).toBeNull();
		expect<string | null>(maybeNothing).toBeUndefined();
		expect<i32>(5).toBeGreaterThan(4);
		expect<i32>(4).toBeLessThan(5);
		expect<f64>(NaN).toBeNaN();
		expect<() => void>(failImmediately).toThrow();
		expect<() => void>((): void => {}).not.toThrow();
		context.diagnostic("jasmine smoke diagnostic");
	});
});
