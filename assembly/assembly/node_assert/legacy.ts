import {
	assertLooseEqual,
	assertNotLooseEqual,
} from "../internal/assert-bridge";

export function equal<Actual, Expected>(
	actual: Actual,
	expected: Expected,
	message: string | null = null,
): void {
	assertLooseEqual(actual, expected, message);
}

export function notEqual<Actual, Expected>(
	actual: Actual,
	expected: Expected,
	message: string | null = null,
): void {
	assertNotLooseEqual(actual, expected, message);
}
