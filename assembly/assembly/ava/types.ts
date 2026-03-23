export {
	AssertionFacade,
	TestContext as ExecutionContext,
} from "../internal/context";
import { TestContext } from "../internal/context";

export type TestFn = (context: TestContext) => void;
export type HookFn = (context: TestContext) => void;

export class Meta {
	get file(): string {
		return "";
	}

	get snapshotDirectory(): string {
		return "";
	}
}

export const sharedMeta = new Meta();
