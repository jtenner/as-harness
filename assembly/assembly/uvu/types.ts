export { TestContext } from "../internal/context";
import { TestContext } from "../internal/context";

export type TestFn = (context: TestContext) => void;
export type HookFn = (context: TestContext) => void;
