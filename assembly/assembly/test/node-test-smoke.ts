import { test, TestContext } from "../node:test";

export { allocateNodeIndexBuffer, discover, invoke, run } from "../exports";

test("passing test", (context: TestContext): void => {
  context.assert.strictEqual<i32>(11, 11);
});

test("failing test", (context: TestContext): void => {
  context.assert.strictEqual<i32>(11, 12, "node:test smoke mismatch");
});
