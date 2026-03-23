import {
	SuiteContext as InternalSuiteContext,
	TestContext as InternalTestContext,
} from "../internal/context";
import {
	assertCondition,
	assertThrows,
	isLooselyEqual,
} from "../internal/assert-bridge";
import {
	getActiveAttempt,
	getActiveExecutionTargetName,
	getActiveExecutionTargetSuiteName,
	recordAssertionCall,
	setPlannedAssertionCount,
} from "../internal/execution-state";
import { HookKind } from "../internal/imports";
import {
	deepStrictEqual,
	notDeepStrictEqual,
	notStrictEqual,
	ok as sharedOk,
	strictEqual,
} from "../node_assert/shared";
import { TrapCallback } from "../internal/trampoline";
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

function defaultMessage(
	message: string | null,
	fallback: string,
): string | null {
	return message === null ? fallback : message;
}

function isTruthyValue<T>(value: T): bool {
	if (isReference<T>()) {
		const reference = changetype<usize>(value);
		if (reference == 0) {
			return false;
		}

		if (isString<T>()) {
			return changetype<string>(value).length > 0;
		}

		return true;
	}

	if (isBoolean<T>()) {
		return <bool>value;
	}

	if (isFloat<T>()) {
		if (sizeof<T>() == sizeof<f32>()) {
			const floatValue = <f32>value;
			return floatValue != 0.0 && !isNaN<f32>(floatValue);
		}

		const floatValue = <f64>value;
		return floatValue != 0.0 && !isNaN<f64>(floatValue);
	}

	return value != 0;
}

let activeStepTestName = "";
let activeStepSuiteName = "";
let activeStepAttempt: i32 = 0;
const recordedSteps = new Array<string>();

function ensureActiveStepBuffer(): void {
	const testName = getActiveExecutionTargetName();
	const suiteName = getActiveExecutionTargetSuiteName();
	const attempt = getActiveAttempt();
	if (
		testName == activeStepTestName &&
		suiteName == activeStepSuiteName &&
		attempt == activeStepAttempt
	) {
		return;
	}

	activeStepTestName = testName;
	activeStepSuiteName = suiteName;
	activeStepAttempt = attempt;
	recordedSteps.length = 0;
}

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

export class Assert {
	expect(count: i32): void {
		setPlannedAssertionCount(count);
	}

	ok<T>(state: T, message: string | null = null): void {
		recordAssertionCall();
		sharedOk(state, defaultMessage(message, "QUnit ok assertion"));
	}

	notOk<T>(state: T, message: string | null = null): void {
		recordAssertionCall();
		assertCondition(
			!isTruthyValue(state),
			defaultMessage(message, "QUnit notOk assertion"),
		);
	}

	true<T>(state: T, message: string | null = null): void {
		recordAssertionCall();
		assertCondition(
			isBoolean<T>() && <bool>state,
			defaultMessage(message, "QUnit true assertion"),
		);
	}

	false<T>(state: T, message: string | null = null): void {
		recordAssertionCall();
		assertCondition(
			isBoolean<T>() && !(<bool>state),
			defaultMessage(message, "QUnit false assertion"),
		);
	}

	equal<Actual, Expected>(
		actual: Actual,
		expected: Expected,
		message: string | null = null,
	): void {
		recordAssertionCall();
		assertCondition(
			isLooselyEqual(actual, expected),
			defaultMessage(message, "QUnit equal assertion"),
		);
	}

	notEqual<Actual, Expected>(
		actual: Actual,
		expected: Expected,
		message: string | null = null,
	): void {
		recordAssertionCall();
		assertCondition(
			!isLooselyEqual(actual, expected),
			defaultMessage(message, "QUnit notEqual assertion"),
		);
	}

	strictEqual<T>(actual: T, expected: T, message: string | null = null): void {
		recordAssertionCall();
		strictEqual(
			actual,
			expected,
			defaultMessage(message, "QUnit strictEqual assertion"),
		);
	}

	notStrictEqual<T>(
		actual: T,
		expected: T,
		message: string | null = null,
	): void {
		recordAssertionCall();
		notStrictEqual(
			actual,
			expected,
			defaultMessage(message, "QUnit notStrictEqual assertion"),
		);
	}

	deepEqual<T>(actual: T, expected: T, message: string | null = null): void {
		recordAssertionCall();
		deepStrictEqual(
			actual,
			expected,
			defaultMessage(message, "QUnit deepEqual assertion"),
		);
	}

	notDeepEqual<T>(actual: T, expected: T, message: string | null = null): void {
		recordAssertionCall();
		notDeepStrictEqual(
			actual,
			expected,
			defaultMessage(message, "QUnit notDeepEqual assertion"),
		);
	}

	throws(callback: TrapCallback, message: string | null = null): void {
		recordAssertionCall();
		assertThrows(callback, defaultMessage(message, "QUnit throws assertion"));
	}

	step(value: string): void {
		ensureActiveStepBuffer();
		recordAssertionCall();
		recordedSteps.push(value);
	}

	verifySteps(steps: Array<string>, message: string | null = null): void {
		ensureActiveStepBuffer();
		recordAssertionCall();
		deepStrictEqual(
			recordedSteps,
			steps,
			defaultMessage(message, "QUnit verifySteps assertion"),
		);
		recordedSteps.length = 0;
	}
}

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
