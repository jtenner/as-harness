import {
	assertDeepStrictEqual,
	assertDoesNotThrow,
	assertIfError,
	assertNotDeepStrictEqual,
	assertNotStrictEqual,
	assertStrictEqual,
	assertThrows,
	assertTruthy,
	failAssertion,
} from "../internal/assert-bridge";
import { TrapCallback } from "../internal/trampoline";

export default function assert<T>(
	value: T,
	message: string | null = null,
): void {
	assertTruthy(value, message);
}

export function fail(message: string | null = null): void {
	failAssertion(message);
}

export function ok<T>(value: T, message: string | null = null): void {
	assert(value, message);
}

export function deepStrictEqual<T>(
	actual: T,
	expected: T,
	message: string | null = null,
): void {
	assertDeepStrictEqual(actual, expected, message);
}

export function notDeepStrictEqual<T>(
	actual: T,
	expected: T,
	message: string | null = null,
): void {
	assertNotDeepStrictEqual(actual, expected, message);
}

export function strictEqual<T>(
	actual: T,
	expected: T,
	message: string | null = null,
): void {
	assertStrictEqual(actual, expected, message);
}

export function notStrictEqual<T>(
	actual: T,
	expected: T,
	message: string | null = null,
): void {
	assertNotStrictEqual(actual, expected, message);
}

export function throws(
	callback: TrapCallback,
	message: string | null = null,
): void {
	assertThrows(callback, message);
}

export function doesNotThrow(
	callback: TrapCallback,
	message: string | null = null,
): void {
	assertDoesNotThrow(callback, message);
}

export function ifError<T>(value: T): void {
	assertIfError(value);
}
