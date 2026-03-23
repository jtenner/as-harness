import { TestContext as InternalTestContext } from "../internal/context";
import {
	getActiveAttempt,
	getActiveExecutionTargetName,
	getObservedAssertionCount,
	getActiveNodePassed,
	recordAssertionCall,
	setPlannedAssertionCount,
} from "../internal/execution-state";
import {
	assertCondition,
	assertDoesNotThrow,
	assertThrows,
} from "../internal/assert-bridge";
import { diagnostic as emitDiagnostic } from "../internal/events";
import { DeclarationMode, HookKind } from "../internal/imports";
import { currentNode, Node } from "../internal/node";
import {
	deepStrictEqual,
	ifError as sharedIfError,
	notDeepStrictEqual,
	notStrictEqual,
	ok as sharedOk,
	strictEqual,
} from "../node_assert/shared";
import { TrapCallback } from "../internal/trampoline";
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

function isNullishValue<T>(value: T): bool {
	if (!isReference<T>()) {
		return false;
	}

	return changetype<usize>(value) == 0;
}

function typeNameFor<T>(value: T): string {
	if (isBoolean<T>()) {
		return "boolean";
	}

	if (isInteger<T>() || isFloat<T>()) {
		return "number";
	}

	if (isString<T>()) {
		return "string";
	}

	if (isReference<T>()) {
		return changetype<usize>(value) == 0 ? "object" : "object";
	}

	return "number";
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

	get count(): i32 {
		return getObservedAssertionCount();
	}

	get attempt(): i32 {
		return getActiveAttempt();
	}

	plan(count: i32, _comment: string | null = null): void {
		setPlannedAssertionCount(count);
	}

	end(): void {
		setPlannedAssertionCount(getObservedAssertionCount());
	}

	comment(message: string): void {
		emitDiagnostic(currentNode.getNodeIndex(), message);
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

	pass(message: string | null = null): void {
		recordAssertionCall();
		if (message !== null && message.length > 0) {
			this.comment(message);
		}
	}

	fail(message: string | null = null): void {
		recordAssertionCall();
		assertCondition(false, defaultMessage(message, "tap fail assertion"));
	}

	ok<T>(value: T, message: string | null = null): void {
		recordAssertionCall();
		sharedOk(value, defaultMessage(message, "tap ok assertion"));
	}

	notOk<T>(value: T, message: string | null = null): void {
		recordAssertionCall();
		assertCondition(
			!isTruthyValue(value),
			defaultMessage(message, "tap notOk assertion"),
		);
	}

	equal<T>(actual: T, expected: T, message: string | null = null): void {
		recordAssertionCall();
		strictEqual(
			actual,
			expected,
			defaultMessage(message, "tap equal assertion"),
		);
	}

	not<T>(actual: T, expected: T, message: string | null = null): void {
		recordAssertionCall();
		notStrictEqual(
			actual,
			expected,
			defaultMessage(message, "tap not assertion"),
		);
	}

	same<T>(actual: T, expected: T, message: string | null = null): void {
		recordAssertionCall();
		deepStrictEqual(
			actual,
			expected,
			defaultMessage(message, "tap same assertion"),
		);
	}

	notSame<T>(actual: T, expected: T, message: string | null = null): void {
		recordAssertionCall();
		notDeepStrictEqual(
			actual,
			expected,
			defaultMessage(message, "tap notSame assertion"),
		);
	}

	strictSame<T>(actual: T, expected: T, message: string | null = null): void {
		this.same(actual, expected, message);
	}

	strictNotSame<T>(
		actual: T,
		expected: T,
		message: string | null = null,
	): void {
		this.notSame(actual, expected, message);
	}

	throws(callback: TrapCallback, message: string | null = null): void {
		recordAssertionCall();
		assertThrows(callback, defaultMessage(message, "tap throws assertion"));
	}

	doesNotThrow(callback: TrapCallback, message: string | null = null): void {
		recordAssertionCall();
		assertDoesNotThrow(
			callback,
			defaultMessage(message, "tap doesNotThrow assertion"),
		);
	}

	type<T>(value: T, expected: string, message: string | null = null): void {
		recordAssertionCall();
		strictEqual(
			typeNameFor(value),
			expected,
			defaultMessage(message, "tap type assertion"),
		);
	}

	error<T>(err: T, message: string | null = null): void {
		recordAssertionCall();
		if (message === null) {
			sharedIfError(err);
			return;
		}

		assertCondition(isNullishValue(err), message);
	}
}

export const sharedTapTest = new Test();
