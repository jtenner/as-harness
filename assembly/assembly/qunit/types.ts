import {
	SuiteContext as InternalSuiteContext,
	TestContext as InternalTestContext,
} from "../internal/context";
import { HookKind } from "../internal/imports";
import { declareHook } from "./parse";

function castHookCallback(
	callback: HookFn | null = null,
): ((context: InternalTestContext) => void) | null {
	return callback === null
		? null
		: changetype<(context: InternalTestContext) => void>(callback);
}

export type TestFn = (assert: Assert) => void;
export type HookFn = (assert: Assert) => void;
export type ModuleFn = (hooks: NestedHooks) => void;

function declareQUnitHook(
	kind: HookKind,
	callback: HookFn | null = null,
): void {
	declareHook(
		kind,
		castHookCallback(callback),
		changetype<InternalTestContext>(sharedAssert),
	);
}

export class Assert {}

export class NestedHooks {
	before(callback: HookFn | null = null): void {
		declareQUnitHook(HookKind.BeforeAll, callback);
	}

	after(callback: HookFn | null = null): void {
		declareQUnitHook(HookKind.AfterAll, callback);
	}

	beforeEach(callback: HookFn | null = null): void {
		declareQUnitHook(HookKind.BeforeEach, callback);
	}

	afterEach(callback: HookFn | null = null): void {
		declareQUnitHook(HookKind.AfterEach, callback);
	}
}

export class GlobalHooks {
	beforeEach(callback: HookFn | null = null): void {
		declareQUnitHook(HookKind.BeforeEach, callback);
	}

	afterEach(callback: HookFn | null = null): void {
		declareQUnitHook(HookKind.AfterEach, callback);
	}
}

export const sharedAssert = new Assert();
export const sharedNestedHooks = new NestedHooks();
export const sharedGlobalHooks = new GlobalHooks();

export const internalQUnitAssertContext =
	changetype<InternalTestContext>(sharedAssert);
export const internalQUnitModuleContext =
	changetype<InternalSuiteContext>(sharedNestedHooks);
