import { assertDeepStrictEqual } from "../internal/assert-bridge";

export function deepStrictEqual<T>(
  actual: T,
  expected: T,
  message: string | null = null,
): void {
  assertDeepStrictEqual(actual, expected, message);
}
