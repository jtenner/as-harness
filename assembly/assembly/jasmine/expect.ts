import {
	expect as sharedExpect,
	Expectation as SharedExpectation,
	NegatedExpectation as SharedNegatedExpectation,
} from "../jest/expect";

export class NegatedMatchers<T> {
	constructor(private readonly inner: SharedNegatedExpectation<T>) {}

	toBe(expected: T, message: string | null = null): void {
		this.inner.toBe(expected, message);
	}

	toEqual(expected: T, message: string | null = null): void {
		this.inner.toEqual(expected, message);
	}

	toBeDefined(message: string | null = null): void {
		this.inner.toBeDefined(message);
	}

	toBeFalsy(message: string | null = null): void {
		this.inner.toBeFalsy(message);
	}

	toBeTruthy(message: string | null = null): void {
		this.inner.toBeTruthy(message);
	}

	toBeNull(message: string | null = null): void {
		this.inner.toBeNull(message);
	}

	toBeUndefined(message: string | null = null): void {
		this.inner.toBeUndefined(message);
	}

	toContain<Expected>(expected: Expected, message: string | null = null): void {
		this.inner.toContain<Expected>(expected, message);
	}

	toBeGreaterThan(expected: T, message: string | null = null): void {
		this.inner.toBeGreaterThan(expected, message);
	}

	toBeLessThan(expected: T, message: string | null = null): void {
		this.inner.toBeLessThan(expected, message);
	}

	toBeNaN(message: string | null = null): void {
		this.inner.toBeNaN(message);
	}

	toThrow(message: string | null = null): void {
		this.inner.toThrow(message);
	}
}

export class Matchers<T> {
	constructor(private readonly inner: SharedExpectation<T>) {}

	get not(): NegatedMatchers<T> {
		return new NegatedMatchers<T>(this.inner.not);
	}

	toBe(expected: T, message: string | null = null): void {
		this.inner.toBe(expected, message);
	}

	toEqual(expected: T, message: string | null = null): void {
		this.inner.toEqual(expected, message);
	}

	toBeDefined(message: string | null = null): void {
		this.inner.toBeDefined(message);
	}

	toBeFalsy(message: string | null = null): void {
		this.inner.toBeFalsy(message);
	}

	toBeTruthy(message: string | null = null): void {
		this.inner.toBeTruthy(message);
	}

	toBeNull(message: string | null = null): void {
		this.inner.toBeNull(message);
	}

	toBeUndefined(message: string | null = null): void {
		this.inner.toBeUndefined(message);
	}

	toContain<Expected>(expected: Expected, message: string | null = null): void {
		this.inner.toContain<Expected>(expected, message);
	}

	toBeGreaterThan(expected: T, message: string | null = null): void {
		this.inner.toBeGreaterThan(expected, message);
	}

	toBeLessThan(expected: T, message: string | null = null): void {
		this.inner.toBeLessThan(expected, message);
	}

	toBeNaN(message: string | null = null): void {
		this.inner.toBeNaN(message);
	}

	toThrow(message: string | null = null): void {
		this.inner.toThrow(message);
	}
}

export function expect<T>(actual: T): Matchers<T> {
	return new Matchers<T>(sharedExpect(actual));
}
