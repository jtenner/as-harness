// Minimal declaration-time contexts for the first `node:test` adapter pass.
// These stay intentionally small until runnable execution exists.

export class SuiteContext {}

export class TestContext {}

export const sharedSuiteContext = new SuiteContext();
export const sharedTestContext = new TestContext();
