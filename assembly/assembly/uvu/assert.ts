import {
	doesNotThrow,
	deepStrictEqual,
	fail,
	notDeepStrictEqual,
	notStrictEqual,
	ok as assertOk,
	strictEqual,
	throws as assertThrows,
} from "../node_assert/shared";
import { assertCondition, isPartialMatch } from "../internal/assert-bridge";
import { TrapCallback } from "../internal/trampoline";

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

export function ok<T>(value: T, message: string | null = null): void {
	assertOk(value, message);
}

export function is<T>(
	actual: T,
	expected: T,
	message: string | null = null,
): void {
	strictEqual(actual, expected, message);
}

export namespace is {
	export function not<T>(
		actual: T,
		expected: T,
		message: string | null = null,
	): void {
		notStrictEqual(actual, expected, message);
	}
}

export function equal<T>(
	actual: T,
	expected: T,
	message: string | null = null,
): void {
	deepStrictEqual(actual, expected, message);
}

export function match<Actual, Expected>(
	actual: Actual,
	expected: Expected,
	message: string | null = null,
): void {
	assertCondition(
		isPartialMatch(actual, expected),
		message === null ? "uvu assert match mismatch" : message,
	);
}

export function type<T>(
	value: T,
	expected: string,
	message: string | null = null,
): void {
	strictEqual(
		typeNameFor(value),
		expected,
		message === null ? "uvu assert type mismatch" : message,
	);
}

export function not<T>(
	actual: T,
	expected: T,
	message: string | null = null,
): void {
	notStrictEqual(actual, expected, message);
}

export namespace not {
	export function equal<T>(
		actual: T,
		expected: T,
		message: string | null = null,
	): void {
		notDeepStrictEqual(actual, expected, message);
	}

	export function type<T>(
		value: T,
		expected: string,
		message: string | null = null,
	): void {
		notStrictEqual(
			typeNameFor(value),
			expected,
			message === null ? "uvu assert not.type mismatch" : message,
		);
	}

	export function match<Actual, Expected>(
		actual: Actual,
		expected: Expected,
		message: string | null = null,
	): void {
		assertCondition(
			!isPartialMatch(actual, expected),
			message === null ? "uvu assert not.match mismatch" : message,
		);
	}

	export function throws(
		callback: TrapCallback,
		message: string | null = null,
	): void {
		doesNotThrow(callback, message);
	}
}

export function throws(
	callback: TrapCallback,
	message: string | null = null,
): void {
	assertThrows(callback, message);
}

export function unreachable(message: string | null = null): void {
	fail(message === null ? "unreachable" : message);
}
