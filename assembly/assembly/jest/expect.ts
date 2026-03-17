import {
  assertCondition,
  assertDeepStrictEqual,
  assertDoesNotThrow,
  assertNotDeepStrictEqual,
  assertNotStrictEqual,
  assertStrictEqual,
  assertThrows,
  assertTruthy,
} from "../internal/assert-bridge";
import { TrapCallback } from "../internal/trampoline";

function isTruthyExpectationValue<T>(value: T): bool {
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

function isNullishExpectationValue<T>(value: T): bool {
  if (!isReference<T>()) {
    return false;
  }

  return changetype<usize>(value) == 0;
}

export class NegatedExpectation<T> {
  constructor(private readonly actual: T) {}

  toBe(expected: T, message: string | null = null): void {
    assertNotStrictEqual(this.actual, expected, message);
  }

  toEqual(expected: T, message: string | null = null): void {
    assertNotDeepStrictEqual(this.actual, expected, message);
  }

  toStrictEqual(expected: T, message: string | null = null): void {
    assertNotDeepStrictEqual(this.actual, expected, message);
  }

  toBeTruthy(message: string | null = null): void {
    assertCondition(!isTruthyExpectationValue(this.actual), message);
  }

  toBeFalsy(message: string | null = null): void {
    assertCondition(isTruthyExpectationValue(this.actual), message);
  }

  toBeNull(message: string | null = null): void {
    assertCondition(!isNullishExpectationValue(this.actual), message);
  }

  toBeUndefined(message: string | null = null): void {
    assertCondition(!isNullishExpectationValue(this.actual), message);
  }

  toBeDefined(message: string | null = null): void {
    assertCondition(isNullishExpectationValue(this.actual), message);
  }

  toThrow(message: string | null = null): void {
    assertDoesNotThrow(changetype<TrapCallback>(this.actual), message);
  }
}

export class Expectation<T> {
  constructor(private readonly actual: T) {}

  get not(): NegatedExpectation<T> {
    return new NegatedExpectation<T>(this.actual);
  }

  toBe(expected: T, message: string | null = null): void {
    assertStrictEqual(this.actual, expected, message);
  }

  toEqual(expected: T, message: string | null = null): void {
    assertDeepStrictEqual(this.actual, expected, message);
  }

  toStrictEqual(expected: T, message: string | null = null): void {
    assertDeepStrictEqual(this.actual, expected, message);
  }

  toBeTruthy(message: string | null = null): void {
    assertTruthy(this.actual, message);
  }

  toBeFalsy(message: string | null = null): void {
    assertCondition(!isTruthyExpectationValue(this.actual), message);
  }

  toBeNull(message: string | null = null): void {
    assertCondition(isNullishExpectationValue(this.actual), message);
  }

  toBeUndefined(message: string | null = null): void {
    assertCondition(isNullishExpectationValue(this.actual), message);
  }

  toBeDefined(message: string | null = null): void {
    assertCondition(!isNullishExpectationValue(this.actual), message);
  }

  toThrow(message: string | null = null): void {
    assertThrows(changetype<TrapCallback>(this.actual), message);
  }
}

export function expect<T>(actual: T): Expectation<T> {
  return new Expectation<T>(actual);
}
