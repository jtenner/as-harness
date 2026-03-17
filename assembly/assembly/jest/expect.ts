import {
  assertCondition,
  assertDeepStrictEqual,
  assertDoesNotThrow,
  assertNotDeepStrictEqual,
  assertNotStrictEqual,
  isDeepStrictlyEqual,
  isStrictlyEqual,
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

function isExpectationNaNValue<T>(value: T): bool {
  if (!isFloat<T>()) {
    return false;
  }

  return sizeof<T>() == sizeof<f32>()
    ? isNaN<f32>(<f32>value)
    : isNaN<f64>(<f64>value);
}

function isGreaterThanExpectationValue<T>(actual: T, expected: T): bool {
  if (isFloat<T>()) {
    return sizeof<T>() == sizeof<f32>()
      ? <f32>actual > <f32>expected
      : <f64>actual > <f64>expected;
  }

  if (isInteger<T>()) {
    return actual > expected;
  }

  return false;
}

function isLessThanExpectationValue<T>(actual: T, expected: T): bool {
  if (isFloat<T>()) {
    return sizeof<T>() == sizeof<f32>()
      ? <f32>actual < <f32>expected
      : <f64>actual < <f64>expected;
  }

  if (isInteger<T>()) {
    return actual < expected;
  }

  return false;
}

function matchesExpectedContainmentValue<Actual, Expected>(
  actual: Actual,
  expected: Expected,
  deep: bool,
): bool {
  return deep
    ? isDeepStrictlyEqual<Expected>(changetype<Expected>(actual), expected)
    : isStrictlyEqual<Expected>(changetype<Expected>(actual), expected);
}

function containsExpectedValue<Actual, Expected>(
  value: Actual,
  expected: Expected,
  deep: bool,
): bool {
  if (isReference<Actual>() && changetype<usize>(value) == 0) {
    return false;
  }

  if (isArrayLike<Actual>()) {
    // @ts-ignore `isArrayLike<Actual>()` guarantees `length` and indexed access.
    for (let i = 0, length = value.length; i < length; i++) {
      if (
        matchesExpectedContainmentValue<Expected, Expected>(
          // @ts-ignore `isArrayLike<Actual>()` guarantees indexed access.
          changetype<Expected>(unchecked(value[i])),
          expected,
          deep,
        )
      ) {
        return true;
      }
    }

    return false;
  }

  if (idof<Actual>() == idof<Set<Expected>>()) {
    const values = changetype<Set<Expected>>(value).values();
    for (let i = 0, length = values.length; i < length; i++) {
      if (
        matchesExpectedContainmentValue<Expected, Expected>(
          unchecked(values[i]),
          expected,
          deep,
        )
      ) {
        return true;
      }
    }

    return false;
  }

  if (idof<Actual>() == idof<Map<Expected, valueof<Actual>>>()) {
    const keys = changetype<Map<Expected, valueof<Actual>>>(value).keys();
    for (let i = 0, length = keys.length; i < length; i++) {
      if (
        matchesExpectedContainmentValue<Expected, Expected>(
          unchecked(keys[i]),
          expected,
          deep,
        )
      ) {
        return true;
      }
    }

    return false;
  }

  return false;
}

function getExpectationLength<T>(value: T): i32 {
  if (isReference<T>() && changetype<usize>(value) == 0) {
    return -1;
  }

  if (isString<T>()) {
    return changetype<string>(value).length;
  }

  if (isArrayLike<T>()) {
    // @ts-ignore `isArrayLike<T>()` guarantees `length`.
    return value.length;
  }

  if (idof<T>() == idof<Set<indexof<T>>>()) {
    return changetype<Set<indexof<T>>>(value).size;
  }

  if (idof<T>() == idof<Map<indexof<T>, valueof<T>>>()) {
    return changetype<Map<indexof<T>, valueof<T>>>(value).size;
  }

  return -1;
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

  toContain<Expected>(expected: Expected, message: string | null = null): void {
    assertCondition(
      !containsExpectedValue<T, Expected>(
        this.actual,
        expected,
        false,
      ),
      message,
    );
  }

  toContainEqual<Expected>(
    expected: Expected,
    message: string | null = null,
  ): void {
    assertCondition(
      !containsExpectedValue<T, Expected>(
        this.actual,
        expected,
        true,
      ),
      message,
    );
  }

  toHaveLength(expected: i32, message: string | null = null): void {
    assertCondition(getExpectationLength(this.actual) != expected, message);
  }

  toBeGreaterThan(expected: T, message: string | null = null): void {
    assertCondition(!isGreaterThanExpectationValue(this.actual, expected), message);
  }

  toBeLessThan(expected: T, message: string | null = null): void {
    assertCondition(!isLessThanExpectationValue(this.actual, expected), message);
  }

  toBeNaN(message: string | null = null): void {
    assertCondition(!isExpectationNaNValue(this.actual), message);
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

  toContain<Expected>(expected: Expected, message: string | null = null): void {
    assertCondition(
      containsExpectedValue<T, Expected>(
        this.actual,
        expected,
        false,
      ),
      message,
    );
  }

  toContainEqual<Expected>(
    expected: Expected,
    message: string | null = null,
  ): void {
    assertCondition(
      containsExpectedValue<T, Expected>(
        this.actual,
        expected,
        true,
      ),
      message,
    );
  }

  toHaveLength(expected: i32, message: string | null = null): void {
    assertCondition(getExpectationLength(this.actual) == expected, message);
  }

  toBeGreaterThan(expected: T, message: string | null = null): void {
    assertCondition(isGreaterThanExpectationValue(this.actual, expected), message);
  }

  toBeLessThan(expected: T, message: string | null = null): void {
    assertCondition(isLessThanExpectationValue(this.actual, expected), message);
  }

  toBeNaN(message: string | null = null): void {
    assertCondition(isExpectationNaNValue(this.actual), message);
  }

  toThrow(message: string | null = null): void {
    assertThrows(changetype<TrapCallback>(this.actual), message);
  }
}

export function expect<T>(actual: T): Expectation<T> {
  return new Expectation<T>(actual);
}
