import { failMessage } from "./events";
import {
  compareStrictEqualityValue,
  resetStrictEqualityReferencePairTracking,
  StrictEqualityResult,
} from "./strict-equality";

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

export function isDeepStrictlyEqual<T>(actual: T, expected: T): bool {
  resetStrictEqualityReferencePairTracking();
  const result = compareStrictEqualityValue(actual, expected);
  resetStrictEqualityReferencePairTracking();
  return result != StrictEqualityResult.Fail;
}

export function assertDeepStrictEqual<T>(
  actual: T,
  expected: T,
  message: string | null = null,
): void {
  assertCondition(isDeepStrictlyEqual(actual, expected), message);
}
