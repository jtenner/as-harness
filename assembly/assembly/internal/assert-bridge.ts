import { failMessage } from "./events";
import {
  compareStrictEqualityValue,
  resetStrictEqualityReferencePairTracking,
  StrictEqualityResult,
} from "./strict-equality";
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

export function failAssertion(message: string | null = null): void {
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

export function assertTruthy<T>(
  value: T,
  message: string | null = null,
): void {
  assertCondition(isTruthyAssertionValue(value), message);
}

export function assertIfError<T>(value: T): void {
  assertCondition(isNullishAssertionValue(value));
}

export function isDeepStrictlyEqual<T>(actual: T, expected: T): bool {
  resetStrictEqualityReferencePairTracking();
  const result = compareStrictEqualityValue(actual, expected);
  resetStrictEqualityReferencePairTracking();
  return result != StrictEqualityResult.Fail;
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

export function assertThrows(
  callback: TrapCallback,
  message: string | null = null,
): void {
  assertCondition(didCallbackTrap(callback), message);
}

export function assertDoesNotThrow(
  callback: TrapCallback,
  message: string | null = null,
): void {
  assertCondition(!didCallbackTrap(callback), message);
}
