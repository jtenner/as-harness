import { TestContext as InternalTestContext } from "../internal/context";
import {
	getActiveAttempt,
	getActiveExecutionTargetName,
	getActiveNodePassed,
} from "../internal/execution-state";
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

export type TestFn = (context: Test) => void;
export type HookFn = (context: Test) => void;
export type TeardownFn = (context: Test) => void;

function declareTapContextTest(
	name: string = "",
	callback: TestFn | null = null,
	mode: DeclarationMode = DeclarationMode.Normal,
	only: bool = false,
): void {
	if (mode == DeclarationMode.Normal && !only) {
		declareTest(
			name,
			castTestCallback(callback),
			changetype<InternalTestContext>(sharedTapTest),
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
		changetype<InternalTestContext>(sharedTapTest),
	);
}

function declareTapContextHook(
	kind: HookKind,
	callback: HookFn | null = null,
): void {
	declareHook(
		kind,
		castHookCallback(callback),
		changetype<InternalTestContext>(sharedTapTest),
	);
}

export class Test {
	get name(): string {
		const activeName = getActiveExecutionTargetName();
		return activeName.length > 0 ? activeName : currentNode.name;
	}

	get fullname(): string {
		return fullNameForCurrentNode();
	}

	get passed(): bool {
		return getActiveNodePassed();
	}

	get attempt(): i32 {
		return getActiveAttempt();
	}

	test(name: string = "", callback: TestFn | null = null): void {
		declareTapContextTest(name, callback);
	}

	skip(name: string = "", callback: TestFn | null = null): void {
		declareTapContextTest(name, callback, DeclarationMode.Skip);
	}

	todo(name: string = "", callback: TestFn | null = null): void {
		declareTapContextTest(name, callback, DeclarationMode.Todo);
	}

	only(name: string = "", callback: TestFn | null = null): void {
		declareTapContextTest(name, callback, DeclarationMode.Normal, true);
	}

	before(callback: HookFn | null = null): void {
		declareTapContextHook(HookKind.BeforeAll, callback);
	}

	after(callback: HookFn | null = null): void {
		declareTapContextHook(HookKind.AfterAll, callback);
	}

	beforeEach(callback: HookFn | null = null): void {
		declareTapContextHook(HookKind.BeforeEach, callback);
	}

	afterEach(callback: HookFn | null = null): void {
		declareTapContextHook(HookKind.AfterEach, callback);
	}

	teardown(callback: TeardownFn | null = null): void {
		this.after(changetype<HookFn | null>(callback));
	}
}

export const sharedTapTest = new Test();
