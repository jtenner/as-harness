import { TestContext as SharedTestContext } from "../internal/context";
import {
	getActiveExecutionTargetName,
	getActiveExecutionTargetSuiteName,
} from "../internal/execution-state";
import { NodeKind } from "../internal/imports";
import { currentNode, Node } from "../internal/node";

function resolveCurrentSuiteName(): string {
	let cursor: Node = currentNode;

	while (true) {
		if (cursor.kind == NodeKind.Describe) {
			return cursor.name;
		}

		if (cursor.parent === null) {
			return "";
		}

		cursor = changetype<Node>(cursor.parent);
	}
}

export class TestContext extends SharedTestContext {
	get __suite__(): string {
		const suiteName = getActiveExecutionTargetSuiteName();
		return suiteName.length > 0 ? suiteName : resolveCurrentSuiteName();
	}

	get __test__(): string {
		const testName = getActiveExecutionTargetName();
		return testName.length > 0 ? testName : currentNode.name;
	}
}

export const sharedTestContext = new TestContext();

export type TestFn = (context: TestContext) => void;
export type HookFn = (context: TestContext) => void;
