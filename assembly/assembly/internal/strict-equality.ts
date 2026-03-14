/**
 * Tri-state result for one structural equality comparison step.
 *
 * `Defer` is reserved for recursive reference pairs that are already active in
 * the current resolution stack.
 */
export const enum StrictEqualityResult {
  Match = 1,
  Fail = 2,
  Defer = 3,
}

/**
 * Value categories supported by the first strict-equality implementation wave.
 */
export const enum StrictEqualityValueKind {
  Primitive = 1,
  NullableReference = 2,
  String = 3,
  ArrayBuffer = 4,
  ArrayLike = 5,
  ArrayBufferView = 6,
  Set = 7,
  Map = 8,
  ManagedClass = 9,
  FunctionReference = 10,
}

export const STRICT_EQUALS_METHOD_NAME = "__asHarnessStrictEquals";
export const ADD_REFLECTED_VALUE_KEY_VALUE_PAIRS_METHOD_NAME =
  "__asHarnessAddReflectedValueKeyValuePairs";

export function isDeferredStrictEqualityResult(
  result: StrictEqualityResult,
): bool {
  return result == StrictEqualityResult.Defer;
}

export function isTerminalStrictEqualityResult(
  result: StrictEqualityResult,
): bool {
  return result != StrictEqualityResult.Defer;
}

export function isSupportedStrictEqualityValueKind(
  kind: StrictEqualityValueKind,
): bool {
  return (
    kind == StrictEqualityValueKind.Primitive ||
    kind == StrictEqualityValueKind.NullableReference ||
    kind == StrictEqualityValueKind.String ||
    kind == StrictEqualityValueKind.ArrayBuffer ||
    kind == StrictEqualityValueKind.ArrayLike ||
    kind == StrictEqualityValueKind.ArrayBufferView ||
    kind == StrictEqualityValueKind.Set ||
    kind == StrictEqualityValueKind.Map ||
    kind == StrictEqualityValueKind.ManagedClass ||
    kind == StrictEqualityValueKind.FunctionReference
  );
}
