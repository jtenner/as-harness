import { OBJECT, TOTAL_OVERHEAD } from "rt/common";

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
export const STRICT_EQUALS_RUNTIME_TYPE_HELPER_NAME =
  "__asHarnessHasStrictEqualityRuntimeType";
export const STRICT_EQUALS_MEMBER_HELPER_NAME = "__asHarnessStrictEqualsMember";
export const ADD_REFLECTED_VALUE_KEY_VALUE_PAIR_HELPER_NAME =
  "__asHarnessAddReflectedValueKeyValuePair";

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

function isStrictEqualityFloatNaN<T>(value: T): bool {
  if (!isFloat<T>()) {
    return false;
  }

  if (sizeof<T>() == sizeof<f32>()) {
    return isNaN<f32>(<f32>value);
  }

  return isNaN<f64>(<f64>value);
}

export function compareStrictEqualityPrimitive<T>(
  left: T,
  right: T,
): StrictEqualityResult {
  if (left == right) {
    return StrictEqualityResult.Match;
  }

  if (isStrictEqualityFloatNaN(left) && isStrictEqualityFloatNaN(right)) {
    return StrictEqualityResult.Match;
  }

  return StrictEqualityResult.Fail;
}

export function compareStrictEqualityNullableReference<T>(
  left: T,
  right: T,
): StrictEqualityResult {
  return changetype<usize>(left) == changetype<usize>(right)
    ? StrictEqualityResult.Match
    : StrictEqualityResult.Fail;
}

export function compareStrictEqualityString(
  left: string,
  right: string,
): StrictEqualityResult {
  return left == right
    ? StrictEqualityResult.Match
    : StrictEqualityResult.Fail;
}

export function compareStrictEqualityValue<T>(
  left: T,
  right: T,
): StrictEqualityResult {
  if (isReference<T>()) {
    if (isString<T>()) {
      return compareStrictEqualityString(
        changetype<string>(left),
        changetype<string>(right),
      );
    }

    return compareStrictEqualityNullableReference(left, right);
  }

  return compareStrictEqualityPrimitive(left, right);
}

export function getStrictEqualityRuntimeTypeId(reference: usize): u32 {
  if (reference == 0) {
    return 0;
  }

  return changetype<OBJECT>(reference - TOTAL_OVERHEAD).rtId;
}

export function __asHarnessHasStrictEqualityRuntimeType(
  reference: usize,
  expectedTypeId: u32,
): bool {
  return getStrictEqualityRuntimeTypeId(reference) == expectedTypeId;
}

export function __asHarnessStrictEqualsMember<T>(
  _memberHash: string,
  left: T,
  right: T,
): bool {
  return compareStrictEqualityValue(left, right) == StrictEqualityResult.Match;
}

export function __asHarnessAddReflectedValueKeyValuePair<T>(
  _memberHash: string,
  _value: T,
): void {}
