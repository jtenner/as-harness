import {
  after,
  afterEach,
  before,
  beforeEach,
  test,
  TestContext,
} from "../node:test";

export { allocateNodeIndexBuffer, discover, invoke, run } from "../exports";

before((_context: TestContext): void => {});
beforeEach((_context: TestContext): void => {});
afterEach((_context: TestContext): void => {});
after((_context: TestContext): void => {});

test("passing test", (context: TestContext): void => {
  context.assert.strictEqual<i32>(11, 11);
});

test("failing test", (context: TestContext): void => {
  context.assert.strictEqual<i32>(11, 12, "node:test smoke mismatch");
});

test("parent test", (context: TestContext): void => {
  context.test("nested child", (_nestedContext: TestContext): void => {});
});
