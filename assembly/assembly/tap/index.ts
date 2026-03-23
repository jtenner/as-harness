import { DeclarationMode, HookKind } from "../internal/imports";
import { TestContext as InternalTestContext } from "../internal/context";
import { declareHook, declareModifiedTest, declareTest } from "./parse";
import { HookFn, sharedTapTest, Test, TestFn } from "./types";

export * from "./types";

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

const internalTapContext = changetype<InternalTestContext>(sharedTapTest);

function declareTapTest(
	name: string = "",
	callback: TestFn | null = null,
	mode: DeclarationMode = DeclarationMode.Normal,
	only: bool = false,
): void {
	if (mode == DeclarationMode.Normal && !only) {
		declareTest(name, castTestCallback(callback), internalTapContext);
		return;
	}

	declareModifiedTest(
		name,
		castTestCallback(callback),
		mode,
		only,
		false,
		0,
		internalTapContext,
	);
}

function declareTapHook(kind: HookKind, callback: HookFn | null = null): void {
	declareHook(kind, castHookCallback(callback), internalTapContext);
}

class TapRoot {
	test(name: string = "", callback: TestFn | null = null): void {
		declareTapTest(name, callback);
	}

	skip(name: string = "", callback: TestFn | null = null): void {
		declareTapTest(name, callback, DeclarationMode.Skip);
	}

	todo(name: string = "", callback: TestFn | null = null): void {
		declareTapTest(name, callback, DeclarationMode.Todo);
	}

	only(name: string = "", callback: TestFn | null = null): void {
		declareTapTest(name, callback, DeclarationMode.Normal, true);
	}

	before(callback: HookFn | null = null): void {
		declareTapHook(HookKind.BeforeAll, callback);
	}

	after(callback: HookFn | null = null): void {
		declareTapHook(HookKind.AfterAll, callback);
	}

	beforeEach(callback: HookFn | null = null): void {
		declareTapHook(HookKind.BeforeEach, callback);
	}

	afterEach(callback: HookFn | null = null): void {
		declareTapHook(HookKind.AfterEach, callback);
	}
}

const tap = new TapRoot();

export default tap;

export function test(name: string = "", callback: TestFn | null = null): void {
	tap.test(name, callback);
}

export function skip(name: string = "", callback: TestFn | null = null): void {
	tap.skip(name, callback);
}

export function todo(name: string = "", callback: TestFn | null = null): void {
	tap.todo(name, callback);
}

export function only(name: string = "", callback: TestFn | null = null): void {
	tap.only(name, callback);
}

export function before(callback: HookFn | null = null): void {
	tap.before(callback);
}

export function after(callback: HookFn | null = null): void {
	tap.after(callback);
}

export function beforeEach(callback: HookFn | null = null): void {
	tap.beforeEach(callback);
}

export function afterEach(callback: HookFn | null = null): void {
	tap.afterEach(callback);
}
