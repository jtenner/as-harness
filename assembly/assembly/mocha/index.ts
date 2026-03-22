import { DeclarationMode, HookKind } from "../internal/imports";
import {
	declareHook,
	declareModifiedSuite,
	declareModifiedTest,
	declareSuite,
	declareTest,
} from "./parse";
import { HookFn, SuiteFn, TestFn } from "./types";

export * from "./types";

function declareBaseTest(
	name: string = "",
	callback: TestFn | null = null,
): void {
	if (callback === null) {
		declareModifiedTest(name, callback, DeclarationMode.Todo);
		return;
	}

	declareTest(name, callback);
}

export function describe(
	name: string = "",
	callback: SuiteFn | null = null,
): void {
	declareSuite(name, callback);
}

export namespace describe {
	export function only(
		name: string = "",
		callback: SuiteFn | null = null,
	): void {
		declareModifiedSuite(name, callback, DeclarationMode.Normal, true);
	}

	export function skip(
		name: string = "",
		callback: SuiteFn | null = null,
	): void {
		declareModifiedSuite(name, callback, DeclarationMode.Skip);
	}
}

export function context(
	name: string = "",
	callback: SuiteFn | null = null,
): void {
	describe(name, callback);
}

export namespace context {
	export function only(
		name: string = "",
		callback: SuiteFn | null = null,
	): void {
		describe.only(name, callback);
	}

	export function skip(
		name: string = "",
		callback: SuiteFn | null = null,
	): void {
		describe.skip(name, callback);
	}
}

export function xdescribe(
	name: string = "",
	callback: SuiteFn | null = null,
): void {
	describe.skip(name, callback);
}

export function xcontext(
	name: string = "",
	callback: SuiteFn | null = null,
): void {
	context.skip(name, callback);
}

export function it(name: string = "", callback: TestFn | null = null): void {
	declareBaseTest(name, callback);
}

export namespace it {
	export function only(
		name: string = "",
		callback: TestFn | null = null,
	): void {
		declareModifiedTest(name, callback, DeclarationMode.Normal, true);
	}

	export function skip(
		name: string = "",
		callback: TestFn | null = null,
	): void {
		declareModifiedTest(name, callback, DeclarationMode.Skip);
	}
}

export function specify(
	name: string = "",
	callback: TestFn | null = null,
): void {
	declareBaseTest(name, callback);
}

export namespace specify {
	export function only(
		name: string = "",
		callback: TestFn | null = null,
	): void {
		declareModifiedTest(name, callback, DeclarationMode.Normal, true);
	}

	export function skip(
		name: string = "",
		callback: TestFn | null = null,
	): void {
		declareModifiedTest(name, callback, DeclarationMode.Skip);
	}
}

export function xit(name: string = "", callback: TestFn | null = null): void {
	it.skip(name, callback);
}

export function xspecify(
	name: string = "",
	callback: TestFn | null = null,
): void {
	specify.skip(name, callback);
}

export function before(callback: HookFn | null = null): void {
	declareHook(HookKind.BeforeAll, callback);
}

export function after(callback: HookFn | null = null): void {
	declareHook(HookKind.AfterAll, callback);
}

export function beforeEach(callback: HookFn | null = null): void {
	declareHook(HookKind.BeforeEach, callback);
}

export function afterEach(callback: HookFn | null = null): void {
	declareHook(HookKind.AfterEach, callback);
}
