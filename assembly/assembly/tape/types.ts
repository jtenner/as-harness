import { TestContext as InternalTestContext } from "../internal/context";
import {
	getActiveAttempt,
	getActiveExecutionTargetName,
	getActiveNodePassed,
	getObservedAssertionCount,
	recordAssertionCall,
	setPlannedAssertionCount,
} from "../internal/execution-state";
import {
	assertCondition,
	assertThrows,
	assertDoesNotThrow,
	isLooselyEqual,
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

	pass(_message: string | null = null): void {
		recordAssertionCall();
	}

	fail(message: string | null = null): void {
		recordAssertionCall();
		assertCondition(false, defaultMessage(message, "tape fail assertion"));
	}

	skip(message: string | null = null): void {
		recordAssertionCall();
		if (message !== null && message.length > 0) {
			this.comment("tape skip assertion: " + message);
		}
	}

	ok<T>(value: T, message: string | null = null): void {
		recordAssertionCall();
		sharedOk(value, defaultMessage(message, "tape ok assertion"));
	}

	assert<T>(value: T, message: string | null = null): void {
		this.ok(value, message);
	}

	true<T>(value: T, message: string | null = null): void {
		this.ok(value, message);
	}

	notOk<T>(value: T, message: string | null = null): void {
		recordAssertionCall();
		assertCondition(
			!isTruthyValue(value),
			defaultMessage(message, "tape notOk assertion"),
		);
	}

	false<T>(value: T, message: string | null = null): void {
		this.notOk(value, message);
	}

	notok<T>(value: T, message: string | null = null): void {
		this.notOk(value, message);
	}

	error<T>(err: T, message: string | null = null): void {
		recordAssertionCall();
		if (message === null) {
			sharedIfError(err);
			return;
		}

		assertCondition(isNullishValue(err), message);
	}

	ifError<T>(err: T): void {
		this.error(err);
	}

	ifErr<T>(err: T): void {
		this.error(err);
	}

	iferror<T>(err: T): void {
		this.error(err);
	}

	equal<T>(actual: T, expected: T, message: string | null = null): void {
		recordAssertionCall();
		strictEqual(
			actual,
			expected,
			defaultMessage(message, "tape equal assertion"),
		);
	}

	equals<T>(actual: T, expected: T, message: string | null = null): void {
		this.equal(actual, expected, message);
	}

	strictEqual<T>(actual: T, expected: T, message: string | null = null): void {
		this.equal(actual, expected, message);
	}

	strictEquals<T>(actual: T, expected: T, message: string | null = null): void {
		this.equal(actual, expected, message);
	}

	isEqual<T>(actual: T, expected: T, message: string | null = null): void {
		this.equal(actual, expected, message);
	}

	is<T>(actual: T, expected: T, message: string | null = null): void {
		this.equal(actual, expected, message);
	}

	notEqual<T>(actual: T, expected: T, message: string | null = null): void {
		recordAssertionCall();
		notStrictEqual(
			actual,
			expected,
			defaultMessage(message, "tape notEqual assertion"),
		);
	}

	notEquals<T>(actual: T, expected: T, message: string | null = null): void {
		this.notEqual(actual, expected, message);
	}

	isNotEqual<T>(actual: T, expected: T, message: string | null = null): void {
		this.notEqual(actual, expected, message);
	}

	doesNotEqual<T>(actual: T, expected: T, message: string | null = null): void {
		this.notEqual(actual, expected, message);
	}

	isInequal<T>(actual: T, expected: T, message: string | null = null): void {
		this.notEqual(actual, expected, message);
	}

	notStrictEqual<T>(
		actual: T,
		expected: T,
		message: string | null = null,
	): void {
		this.notEqual(actual, expected, message);
	}

	notStrictEquals<T>(
		actual: T,
		expected: T,
		message: string | null = null,
	): void {
		this.notEqual(actual, expected, message);
	}

	isNot<T>(actual: T, expected: T, message: string | null = null): void {
		this.notEqual(actual, expected, message);
	}

	not<T>(actual: T, expected: T, message: string | null = null): void {
		this.notEqual(actual, expected, message);
	}

	looseEqual<Actual, Expected>(
		actual: Actual,
		expected: Expected,
		message: string | null = null,
	): void {
		recordAssertionCall();
		assertCondition(
			isLooselyEqual(actual, expected),
			defaultMessage(message, "tape looseEqual assertion"),
		);
	}

	looseEquals<Actual, Expected>(
		actual: Actual,
		expected: Expected,
		message: string | null = null,
	): void {
		this.looseEqual(actual, expected, message);
	}

	notLooseEqual<Actual, Expected>(
		actual: Actual,
		expected: Expected,
		message: string | null = null,
	): void {
		recordAssertionCall();
		assertCondition(
			!isLooselyEqual(actual, expected),
			defaultMessage(message, "tape notLooseEqual assertion"),
		);
	}

	notLooseEquals<Actual, Expected>(
		actual: Actual,
		expected: Expected,
		message: string | null = null,
	): void {
		this.notLooseEqual(actual, expected, message);
	}

	deepEqual<T>(actual: T, expected: T, message: string | null = null): void {
		recordAssertionCall();
		deepStrictEqual(
			actual,
			expected,
			defaultMessage(message, "tape deepEqual assertion"),
		);
	}

	deepEquals<T>(actual: T, expected: T, message: string | null = null): void {
		this.deepEqual(actual, expected, message);
	}

	isEquivalent<T>(actual: T, expected: T, message: string | null = null): void {
		this.deepEqual(actual, expected, message);
	}

	same<T>(actual: T, expected: T, message: string | null = null): void {
		this.deepEqual(actual, expected, message);
	}

	notDeepEqual<T>(actual: T, expected: T, message: string | null = null): void {
		recordAssertionCall();
		notDeepStrictEqual(
			actual,
			expected,
			defaultMessage(message, "tape notDeepEqual assertion"),
		);
	}

	notDeepEquals<T>(
		actual: T,
		expected: T,
		message: string | null = null,
	): void {
		this.notDeepEqual(actual, expected, message);
	}

	notEquivalent<T>(
		actual: T,
		expected: T,
		message: string | null = null,
	): void {
		this.notDeepEqual(actual, expected, message);
	}

	notDeeply<T>(actual: T, expected: T, message: string | null = null): void {
		this.notDeepEqual(actual, expected, message);
	}

	notSame<T>(actual: T, expected: T, message: string | null = null): void {
		this.notDeepEqual(actual, expected, message);
	}

	isNotDeepEqual<T>(
		actual: T,
		expected: T,
		message: string | null = null,
	): void {
		this.notDeepEqual(actual, expected, message);
	}

	isNotDeeply<T>(actual: T, expected: T, message: string | null = null): void {
		this.notDeepEqual(actual, expected, message);
	}

	isNotEquivalent<T>(
		actual: T,
		expected: T,
		message: string | null = null,
	): void {
		this.notDeepEqual(actual, expected, message);
	}

	isInequivalent<T>(
		actual: T,
		expected: T,
		message: string | null = null,
	): void {
		this.notDeepEqual(actual, expected, message);
	}

	throws(callback: TrapCallback, message: string | null = null): void {
		recordAssertionCall();
		assertThrows(callback, defaultMessage(message, "tape throws assertion"));
	}

	doesNotThrow(callback: TrapCallback, message: string | null = null): void {
		recordAssertionCall();
		assertDoesNotThrow(
			callback,
			defaultMessage(message, "tape doesNotThrow assertion"),
		);
	}
}

export const sharedTapeContext = new TestContext();
