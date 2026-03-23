import { failMessage } from "./events";
import {
	clearActiveErrorMessage,
	restoreActiveFailureState,
	setActiveErrorMessage,
	setActiveFailureKind,
	takeActiveFailureStateSnapshot,
} from "./failure-state";
import { isPartialMatch as matchesPartialShape } from "./partial-match";
import { isRuntimeTypeInstance as matchesRuntimeTypeInstance } from "./runtime-type";
import {
	compareStrictEqualityValue,
	resetStrictEqualityReferencePairTracking,
	StrictEqualityResult,
} from "./strict-equality";
import { FailureKind } from "./imports";
import { TrapCallback, didCallbackTrap } from "./trampoline";

function isStrictlyEqualFloat<T>(left: T, right: T): bool {
	if (!isFloat<T>()) {
		return false;
	}

	if (sizeof<T>() == sizeof<f32>()) {
		const leftValue = <f32>left;
		const rightValue = <f32>right;

		if (isNaN<f32>(leftValue) && isNaN<f32>(rightValue)) {
			return true;
		}

		return leftValue == rightValue;
	}

	const leftValue = <f64>left;
	const rightValue = <f64>right;

	if (isNaN<f64>(leftValue) && isNaN<f64>(rightValue)) {
		return true;
	}

	return leftValue == rightValue;
}

function isTruthyAssertionValue<T>(value: T): bool {
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

function isNullishAssertionValue<T>(value: T): bool {
	if (!isReference<T>()) {
		return false;
	}

	return changetype<usize>(value) == 0;
}

function areLooseNumbersEqual(left: f64, right: f64): bool {
	if (isNaN(left) || isNaN(right)) {
		return isNaN(left) && isNaN(right);
	}

	return left == right;
}

function coerceLooseNumberFromString(value: string): f64 {
	const trimmed = value.trim();
	if (trimmed.length == 0) {
		return 0.0;
	}

	let start = 0;
	const firstChar = trimmed.charCodeAt(0);
	if (firstChar == 0x2b || firstChar == 0x2d) {
		start = 1;
	}

	if (
		trimmed.length - start > 2 &&
		trimmed.charCodeAt(start) == 0x30 &&
		(trimmed.charCodeAt(start + 1) == 0x78 ||
			trimmed.charCodeAt(start + 1) == 0x58)
	) {
		return parseInt(trimmed, 0);
	}

	return f64.parse(trimmed);
}

function coerceLoosePrimitiveNumber<T>(value: T): f64 {
	if (isBoolean<T>()) {
		return <bool>value ? 1.0 : 0.0;
	}

	if (isFloat<T>()) {
		if (sizeof<T>() == sizeof<f32>()) {
			return <f32>value;
		}

		return <f64>value;
	}

	if (isInteger<T>()) {
		return <f64>value;
	}

	return NaN;
}

function isLooselyEqualStringAndPrimitive<T>(text: string, value: T): bool {
	const parsed = coerceLooseNumberFromString(text);
	if (isNaN(parsed)) {
		return false;
	}

	return areLooseNumbersEqual(parsed, coerceLoosePrimitiveNumber(value));
}

export function failAssertion(message: string | null = null): void {
	setActiveErrorMessage(message);
	setActiveFailureKind(<u8>FailureKind.Assertion);

	if (message !== null) {
		failMessage(message);
	}

	unreachable();
}

export function assertCondition(
	condition: bool,
	message: string | null = null,
): void {
	if (!condition) {
		failAssertion(message);
	}
}

export function assertTruthy<T>(value: T, message: string | null = null): void {
	assertCondition(isTruthyAssertionValue(value), message);
}

export function assertIfError<T>(value: T): void {
	assertCondition(isNullishAssertionValue(value));
}

export function isLooselyEqual<Actual, Expected>(
	actual: Actual,
	expected: Expected,
): bool {
	if (isReference<Actual>()) {
		const actualReference = changetype<usize>(actual);

		if (isString<Actual>()) {
			if (actualReference == 0) {
				return isReference<Expected>() && changetype<usize>(expected) == 0;
			}

			if (isReference<Expected>()) {
				const expectedReference = changetype<usize>(expected);
				if (!isString<Expected>()) {
					return false;
				}

				if (expectedReference == 0) {
					return false;
				}

				return changetype<string>(actual) == changetype<string>(expected);
			}

			return isLooselyEqualStringAndPrimitive(
				changetype<string>(actual),
				expected,
			);
		}

		if (!isReference<Expected>()) {
			return false;
		}

		return actualReference == changetype<usize>(expected);
	}

	if (isReference<Expected>()) {
		const expectedReference = changetype<usize>(expected);
		if (!isString<Expected>()) {
			return false;
		}

		if (expectedReference == 0) {
			return false;
		}

		return isLooselyEqualStringAndPrimitive(
			changetype<string>(expected),
			actual,
		);
	}

	return areLooseNumbersEqual(
		coerceLoosePrimitiveNumber(actual),
		coerceLoosePrimitiveNumber(expected),
	);
}

export function isDeepStrictlyEqual<T>(actual: T, expected: T): bool {
	resetStrictEqualityReferencePairTracking();
	const result = compareStrictEqualityValue(actual, expected);
	resetStrictEqualityReferencePairTracking();
	return result != StrictEqualityResult.Fail;
}

export function isPartialMatch<Actual, Expected>(
	actual: Actual,
	expected: Expected,
): bool {
	return matchesPartialShape(actual, expected);
}

export function isRuntimeTypeInstance<T>(
	value: T,
	expectedRuntimeTypeId: u32,
): bool {
	return matchesRuntimeTypeInstance(value, expectedRuntimeTypeId);
}

export function isStrictlyEqual<T>(actual: T, expected: T): bool {
	if (isReference<T>()) {
		if (isString<T>()) {
			const actualReference = changetype<usize>(actual);
			const expectedReference = changetype<usize>(expected);

			if (actualReference == expectedReference) {
				return true;
			}

			if (actualReference == 0 || expectedReference == 0) {
				return false;
			}

			return changetype<string>(actual) == changetype<string>(expected);
		}

		return changetype<usize>(actual) == changetype<usize>(expected);
	}

	return isStrictlyEqualFloat(actual, expected) || actual == expected;
}

export function assertDeepStrictEqual<T>(
	actual: T,
	expected: T,
	message: string | null = null,
): void {
	assertCondition(isDeepStrictlyEqual(actual, expected), message);
}

export function assertNotDeepStrictEqual<T>(
	actual: T,
	expected: T,
	message: string | null = null,
): void {
	assertCondition(!isDeepStrictlyEqual(actual, expected), message);
}

export function assertStrictEqual<T>(
	actual: T,
	expected: T,
	message: string | null = null,
): void {
	assertCondition(isStrictlyEqual(actual, expected), message);
}

export function assertNotStrictEqual<T>(
	actual: T,
	expected: T,
	message: string | null = null,
): void {
	assertCondition(!isStrictlyEqual(actual, expected), message);
}

export function assertLooseEqual<Actual, Expected>(
	actual: Actual,
	expected: Expected,
	message: string | null = null,
): void {
	assertCondition(isLooselyEqual(actual, expected), message);
}

export function assertNotLooseEqual<Actual, Expected>(
	actual: Actual,
	expected: Expected,
	message: string | null = null,
): void {
	assertCondition(!isLooselyEqual(actual, expected), message);
}

export function assertThrows(
	callback: TrapCallback,
	message: string | null = null,
): void {
	const snapshot = takeActiveFailureStateSnapshot();
	clearActiveErrorMessage();
	const trapped = didCallbackTrap(callback);
	restoreActiveFailureState(snapshot);
	assertCondition(trapped, message);
}

export function assertDoesNotThrow(
	callback: TrapCallback,
	message: string | null = null,
): void {
	const snapshot = takeActiveFailureStateSnapshot();
	clearActiveErrorMessage();
	const trapped = didCallbackTrap(callback);
	restoreActiveFailureState(snapshot);
	assertCondition(!trapped, message);
}
