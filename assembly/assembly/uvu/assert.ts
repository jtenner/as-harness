import {
	clearActiveErrorMessage,
	getActiveAssertionFailureRecord,
	getActiveFailureKind,
	restoreActiveFailureState,
	stageActiveAssertionFailure,
	takeActiveFailureStateSnapshot,
} from "../internal/failure-state";
import {
	isDeepStrictlyEqual,
	isPartialMatch,
	isRuntimeTypeInstance,
	isStrictlyEqual,
	trapWithActiveFailureState,
} from "../internal/assert-bridge";
import {
	readLastArtifactText,
	tryFixtureRead,
	trySnapshotCheck,
} from "../internal/artifacts";
import { FailureKind } from "../internal/imports";
import { stringifyReflectedValue } from "../internal/reflected-render";
import { TrapCallback, didCallbackTrap } from "../internal/trampoline";

@final
class ObservedTrapResult {
	trapped: bool;
	assertion: Assertion | null;

	constructor(trapped: bool, assertion: Assertion | null = null) {
		this.trapped = trapped;
		this.assertion = assertion;
	}
}

export class Assertion extends Error {
	name: string;
	code: string;
	details: string | null;
	generated: bool;
	operator: string;
	expects: string | null;
	actual: string | null;

	constructor(
		message: string | null = null,
		operator: string = "",
		actual: string | null = null,
		expects: string | null = null,
		details: string | null = null,
		generated: bool = false,
	) {
		super(message === null ? "" : message);
		this.name = "Assertion";
		this.code = "ERR_ASSERTION";
		this.details = details;
		this.generated = generated;
		this.operator = operator;
		this.expects = expects;
		this.actual = actual;
	}
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

function failWithAssertion(
	operator: string,
	actual: string | null,
	expects: string | null,
	backupMessage: string,
	message: string | null = null,
	details: string | null = null,
): void {
	const resolvedMessage = message === null ? backupMessage : message;
	stageActiveAssertionFailure(
		resolvedMessage,
		operator,
		actual,
		expects,
		details,
		message === null,
	);
	trapWithActiveFailureState(resolvedMessage);
}

function rethrowAssertion(assertion: Assertion): void {
	stageActiveAssertionFailure(
		assertion.message,
		assertion.operator,
		assertion.actual,
		assertion.expects,
		assertion.details,
		assertion.generated,
	);
	trapWithActiveFailureState(assertion.message);
}

function activeObservedAssertion(): Assertion | null {
	if (getActiveFailureKind() != <u8>FailureKind.Assertion) {
		return null;
	}

	const record = getActiveAssertionFailureRecord();
	if (record === null) {
		return null;
	}

	return new Assertion(
		record.message,
		record.operator !== null ? changetype<string>(record.operator) : "",
		record.actual,
		record.expects,
		record.details,
		record.generated,
	);
}

function observeTrap(callback: TrapCallback): ObservedTrapResult {
	const snapshot = takeActiveFailureStateSnapshot();
	clearActiveErrorMessage();
	const trapped = didCallbackTrap(callback);
	const assertion = trapped ? activeObservedAssertion() : null;
	restoreActiveFailureState(snapshot);
	return new ObservedTrapResult(trapped, assertion);
}

export function ok<T>(value: T, message: string | null = null): void {
	if (isTruthyValue(value)) {
		return;
	}

	failWithAssertion(
		"ok",
		stringifyReflectedValue(value),
		"truthy",
		"Expected value to be truthy",
		message,
	);
}

export function is<T>(
	actual: T,
	expected: T,
	message: string | null = null,
): void {
	if (isStrictlyEqual(actual, expected)) {
		return;
	}

	failWithAssertion(
		"is",
		stringifyReflectedValue(actual),
		stringifyReflectedValue(expected),
		"Expected values to be strictly equal",
		message,
	);
}

export namespace is {
	export function not<T>(
		actual: T,
		expected: T,
		message: string | null = null,
	): void {
		if (!isStrictlyEqual(actual, expected)) {
			return;
		}

		failWithAssertion(
			"is.not",
			stringifyReflectedValue(actual),
			stringifyReflectedValue(expected),
			"Expected values not to be strictly equal",
			message,
		);
	}
}

export function equal<T>(
	actual: T,
	expected: T,
	message: string | null = null,
): void {
	if (isDeepStrictlyEqual(actual, expected)) {
		return;
	}

	failWithAssertion(
		"equal",
		stringifyReflectedValue(actual),
		stringifyReflectedValue(expected),
		"Expected values to be deeply equal",
		message,
	);
}

export function match<Actual, Expected>(
	actual: Actual,
	expected: Expected,
	message: string | null = null,
): void {
	if (isPartialMatch(actual, expected)) {
		return;
	}

	failWithAssertion(
		"match",
		stringifyReflectedValue(actual),
		stringifyReflectedValue(expected),
		"uvu assert match mismatch",
		message,
	);
}

export function instance<T>(
	value: T,
	expectedRuntimeTypeId: u32,
	message: string | null = null,
): void {
	if (isRuntimeTypeInstance(value, expectedRuntimeTypeId)) {
		return;
	}

	failWithAssertion(
		"instance",
		stringifyReflectedValue(value),
		expectedRuntimeTypeId.toString(),
		"uvu assert instance mismatch",
		message,
	);
}

export function type<T>(
	value: T,
	expected: string,
	message: string | null = null,
): void {
	const actualType = typeNameFor(value);
	if (actualType == expected) {
		return;
	}

	failWithAssertion(
		"type",
		actualType,
		expected,
		"uvu assert type mismatch",
		message,
	);
}

export function not<T>(
	actual: T,
	expected: T,
	message: string | null = null,
): void {
	if (!isStrictlyEqual(actual, expected)) {
		return;
	}

	failWithAssertion(
		"not",
		stringifyReflectedValue(actual),
		stringifyReflectedValue(expected),
		"Expected values not to be strictly equal",
		message,
	);
}

export namespace not {
	export function equal<T>(
		actual: T,
		expected: T,
		message: string | null = null,
	): void {
		if (!isDeepStrictlyEqual(actual, expected)) {
			return;
		}

		failWithAssertion(
			"not.equal",
			stringifyReflectedValue(actual),
			stringifyReflectedValue(expected),
			"Expected values not to be deeply equal",
			message,
		);
	}

	export function type<T>(
		value: T,
		expected: string,
		message: string | null = null,
	): void {
		const actualType = typeNameFor(value);
		if (actualType != expected) {
			return;
		}

		failWithAssertion(
			"not.type",
			actualType,
			expected,
			"uvu assert not.type mismatch",
			message,
		);
	}

	export function match<Actual, Expected>(
		actual: Actual,
		expected: Expected,
		message: string | null = null,
	): void {
		if (!isPartialMatch(actual, expected)) {
			return;
		}

		failWithAssertion(
			"not.match",
			stringifyReflectedValue(actual),
			stringifyReflectedValue(expected),
			"uvu assert not.match mismatch",
			message,
		);
	}

	export function instance<T>(
		value: T,
		expectedRuntimeTypeId: u32,
		message: string | null = null,
	): void {
		if (!isRuntimeTypeInstance(value, expectedRuntimeTypeId)) {
			return;
		}

		failWithAssertion(
			"not.instance",
			stringifyReflectedValue(value),
			expectedRuntimeTypeId.toString(),
			"uvu assert not.instance mismatch",
			message,
		);
	}

	export function throws(
		callback: TrapCallback,
		message: string | null = null,
	): void {
		const observed = observeTrap(callback);
		if (!observed.trapped) {
			return;
		}

		failWithAssertion(
			"not.throws",
			"true",
			"false",
			"Expected function not to throw",
			message,
		);
	}
}

export function throws(
	callback: TrapCallback,
	message: string | null = null,
): void {
	const observed = observeTrap(callback);
	if (!observed.trapped) {
		failWithAssertion(
			"throws",
			"false",
			"true",
			"Expected function to throw",
			message,
		);
		return;
	}

	if (observed.assertion !== null) {
		rethrowAssertion(changetype<Assertion>(observed.assertion));
	}
}

export function snapshot<T>(value: T, label: string | null = null): void {
	const serialized = stringifyReflectedValue(value);
	if (trySnapshotCheck(serialized, label)) {
		return;
	}

	const failureMessage = readLastArtifactText();
	failWithAssertion(
		"snapshot",
		serialized,
		label,
		failureMessage.length > 0 ? failureMessage : "uvu assert snapshot mismatch",
	);
}

export function fixture(path: string): string {
	const value = tryFixtureRead(path);
	if (value !== null) {
		return value;
	}

	const failureMessage = readLastArtifactText();
	failWithAssertion(
		"fixture",
		path,
		"fixture to exist",
		failureMessage.length > 0 ? failureMessage : "uvu assert fixture missing",
	);
	return "";
}

export function unreachable(message: string | null = null): void {
	failWithAssertion("unreachable", "true", "false", "unreachable", message);
}
