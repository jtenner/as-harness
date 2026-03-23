import { TestContext as InternalTestContext } from "../internal/context";
import {
	getActiveAttempt,
	getActiveExecutionTargetName,
	getActiveNodePassed,
	getObservedAssertionCount,
	setPlannedAssertionCount,
} from "../internal/execution-state";
import { diagnostic as emitDiagnostic } from "../internal/events";
import { DeclarationMode, HookKind } from "../internal/imports";
import { currentNode, Node } from "../internal/node";
import { declareHook, declareModifiedTest, declareTest } from "./parse";

function fullNameForCurrentNode(): string {
	let result = currentNode.name;
	let cursor: Node | null = currentNode.parent;

	while (cursor !== null && cursor.parent !== null) {
		result = cursor.name + " > " + result;
		cursor = cursor.parent;
	}

	return result;
}

function castTestCallback(
	callback: TestFn | null = null,
): ((context: InternalTestContext) => void) | null {
	return callback === null
		? null
		: changetype<(context: InternalTestContext) => void>(callback);
}

function castHookCallback(
	callback: HookFn | null = null,
): ((context: InternalTestContext) => void) | null {
	return callback === null
		? null
		: changetype<(context: InternalTestContext) => void>(callback);
}

export type TestFn = (context: TestContext) => void;
export type HookFn = (context: TestContext) => void;
export type TeardownFn = (context: TestContext) => void;

function declareTapeContextTest(
	name: string = "",
	callback: TestFn | null = null,
	mode: DeclarationMode = DeclarationMode.Normal,
	only: bool = false,
): void {
	if (mode == DeclarationMode.Normal && !only) {
		declareTest(
			name,
			castTestCallback(callback),
			changetype<InternalTestContext>(sharedTapeContext),
		);
		return;
	}

	declareModifiedTest(
		name,
		castTestCallback(callback),
		mode,
		only,
		false,
		0,
		changetype<InternalTestContext>(sharedTapeContext),
	);
}

function declareTapeContextHook(
	kind: HookKind,
	callback: HookFn | null = null,
): void {
	declareHook(
		kind,
		castHookCallback(callback),
		changetype<InternalTestContext>(sharedTapeContext),
	);
}

export class TestContext {
	get name(): string {
		const activeName = getActiveExecutionTargetName();
		return activeName.length > 0 ? activeName : currentNode.name;
	}

	get fullName(): string {
		return fullNameForCurrentNode();
	}

	get passed(): bool {
		return getActiveNodePassed();
	}

	get error(): usize {
		return changetype<InternalTestContext>(this).error;
	}

	get attempt(): i32 {
		return getActiveAttempt();
	}

	plan(count: i32): void {
		setPlannedAssertionCount(count);
	}

	end(): void {
		setPlannedAssertionCount(getObservedAssertionCount());
	}

	comment(message: string): void {
		emitDiagnostic(currentNode.getNodeIndex(), message);
	}

	test(name: string = "", callback: TestFn | null = null): void {
		declareTapeContextTest(name, callback);
	}

	teardown(callback: TeardownFn | null = null): void {
		declareTapeContextHook(HookKind.AfterAll, callback);
	}
}

export const sharedTapeContext = new TestContext();
