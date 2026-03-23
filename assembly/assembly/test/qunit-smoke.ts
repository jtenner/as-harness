import QUnit from "../qunit";
import { Assert, NestedHooks } from "../qunit";
import { module as qunitModule } from "../qunit";

export { allocateNodeIndexBuffer, discover, invoke, run } from "../exports";

let rootBeforeEachCount = 0;
let rootAfterEachCount = 0;
let moduleBeforeCount = 0;
let moduleAfterCount = 0;

QUnit.hooks.beforeEach((assert: Assert): void => {
	rootBeforeEachCount += 1;
	assert.step("root beforeEach");
});

QUnit.hooks.afterEach((_assert: Assert): void => {
	rootAfterEachCount += 1;
});

QUnit.skip("skipped qunit placeholder");
QUnit.todo("todo qunit placeholder");

QUnit.module("qunit parent", (hooks: NestedHooks): void => {
	hooks.before((_assert: Assert): void => {
		moduleBeforeCount = 1;
	});

	hooks.after((_assert: Assert): void => {
		moduleAfterCount = rootAfterEachCount;
	});

	hooks.beforeEach((assert: Assert): void => {
		assert.step("module beforeEach");
	});

	hooks.afterEach((_assert: Assert): void => {});

	QUnit.test("qunit passing test", (assert: Assert): void => {
		assert.expect(16);
		assert.strictEqual<i32>(moduleBeforeCount, 1, "module before mismatch");
		assert.strictEqual<i32>(rootAfterEachCount, 0, "afterEach ran too early");
		assert.ok<bool>(true);
		assert.notOk<i32>(0);
		assert.true<bool>(true);
		assert.false<bool>(false);
		assert.equal<string, i32>("11", 11);
		assert.notEqual<string, i32>("11", 12);
		assert.strictEqual<i32>(21, 21);
		assert.notStrictEqual<i32>(21, 22);
		assert.deepEqual<Array<i32>>([1, 2], [1, 2]);
		assert.notDeepEqual<Array<i32>>([1, 2], [1, 3]);
		assert.throws((): void => {
			unreachable();
		});
		assert.verifySteps(["root beforeEach", "module beforeEach"]);
	});

	QUnit.test("qunit second test", (assert: Assert): void => {
		assert.expect(6);
		assert.strictEqual<i32>(rootAfterEachCount, 0, "afterEach count mismatch");
		assert.step("second test");
		assert.verifySteps(["root beforeEach", "module beforeEach", "second test"]);
		assert.strictEqual<i32>(moduleAfterCount, 0, "module after ran too early");
	});
});

qunitModule.todo("qunit todo module", (_hooks: NestedHooks): void => {
	QUnit.test("expected failure leaf", (assert: Assert): void => {
		assert.expect(2);
		assert.strictEqual<i32>(11, 12, "todo failure mismatch");
	});

	QUnit.module("nested todo suite", (_nestedHooks: NestedHooks): void => {
		QUnit.test("nested expected failure", (assert: Assert): void => {
			assert.expect(2);
			assert.strictEqual<i32>(21, 22, "nested todo failure mismatch");
		});
	});
});
