export { SuiteContext, TestContext } from "../internal/context";
import { SuiteContext, TestContext } from "../internal/context";

export type TestFn = (context: TestContext) => void;
export type SuiteFn = (context: SuiteContext) => void;
export type HookFn = (context: TestContext) => void;

export class TestOptions {}

export class SuiteOptions {}

export class HookOptions {}
