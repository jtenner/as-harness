import {
	deepStrictEqual,
	fail,
	notDeepStrictEqual,
	notStrictEqual,
	ok as assertOk,
	strictEqual,
} from "../node_assert/shared";

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
}

export function unreachable(message: string | null = null): void {
	fail(message === null ? "unreachable" : message);
}
