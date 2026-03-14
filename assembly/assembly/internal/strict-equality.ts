import { memory } from "memory";
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
export const STRICT_EQUALS_ARRAY_BUFFER_MEMBER_HELPER_NAME =
  "__asHarnessStrictEqualsArrayBufferMember";
export const STRICT_EQUALS_MANAGED_CLASS_MEMBER_HELPER_NAME =
  "__asHarnessStrictEqualsManagedClassMember";
export const ADD_REFLECTED_VALUE_KEY_VALUE_PAIR_HELPER_NAME =
  "__asHarnessAddReflectedValueKeyValuePair";

export type StrictEqualityReferencePairComparator = (
  left: usize,
  right: usize,
) => StrictEqualityResult;

const activeStrictEqualityReferencePairs = new Array<usize>();
const provenStrictEqualityReferencePairs = new Array<usize>();

function findStrictEqualityReferencePairIndex(
  pairs: Array<usize>,
  left: usize,
  right: usize,
): i32 {
  for (let i = 0, length = pairs.length; i < length; i += 2) {
    if (unchecked(pairs[i]) == left && unchecked(pairs[i + 1]) == right) {
      return i;
    }
  }

  return -1;
}

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

export function compareStrictEqualityArrayBuffer(
  left: ArrayBuffer | null,
  right: ArrayBuffer | null,
): StrictEqualityResult {
  if (left == right) {
    return StrictEqualityResult.Match;
  }

  if (left === null || right === null) {
    return StrictEqualityResult.Fail;
  }

  const byteLength = left.byteLength;
  if (byteLength != right.byteLength) {
    return StrictEqualityResult.Fail;
  }

  if (byteLength == 0) {
    return StrictEqualityResult.Match;
  }

  return memory.compare(
    changetype<usize>(left),
    changetype<usize>(right),
    <usize>byteLength,
  ) == 0
    ? StrictEqualityResult.Match
    : StrictEqualityResult.Fail;
}

export function compareStrictEqualityArray<T>(
  left: Array<T> | null,
  right: Array<T> | null,
): StrictEqualityResult {
  const leftReference = changetype<usize>(left);
  const rightReference = changetype<usize>(right);

  if (leftReference == rightReference) {
    return StrictEqualityResult.Match;
  }

  if (leftReference == 0 || rightReference == 0) {
    return StrictEqualityResult.Fail;
  }

  if (hasProvenStrictEqualityReferencePair(leftReference, rightReference)) {
    return StrictEqualityResult.Match;
  }

  if (hasActiveStrictEqualityReferencePair(leftReference, rightReference)) {
    return StrictEqualityResult.Defer;
  }

  pushActiveStrictEqualityReferencePair(leftReference, rightReference);

  let result = StrictEqualityResult.Match;
  const leftArray = changetype<Array<T>>(leftReference);
  const rightArray = changetype<Array<T>>(rightReference);
  const length = leftArray.length;

  if (length != rightArray.length) {
    result = StrictEqualityResult.Fail;
  } else {
    for (let i = 0; i < length; i++) {
      if (
        compareStrictEqualityValue<T>(leftArray[i], rightArray[i]) ==
        StrictEqualityResult.Fail
      ) {
        result = StrictEqualityResult.Fail;
        break;
      }
    }
  }

  popActiveStrictEqualityReferencePair();

  if (result == StrictEqualityResult.Match) {
    recordProvenStrictEqualityReferencePair(leftReference, rightReference);
  }

  return result;
}

export function compareStrictEqualityStaticArray<T>(
  left: StaticArray<T> | null,
  right: StaticArray<T> | null,
): StrictEqualityResult {
  const leftReference = changetype<usize>(left);
  const rightReference = changetype<usize>(right);

  if (leftReference == rightReference) {
    return StrictEqualityResult.Match;
  }

  if (leftReference == 0 || rightReference == 0) {
    return StrictEqualityResult.Fail;
  }

  if (hasProvenStrictEqualityReferencePair(leftReference, rightReference)) {
    return StrictEqualityResult.Match;
  }

  if (hasActiveStrictEqualityReferencePair(leftReference, rightReference)) {
    return StrictEqualityResult.Defer;
  }

  pushActiveStrictEqualityReferencePair(leftReference, rightReference);

  let result = StrictEqualityResult.Match;
  const leftArray = changetype<StaticArray<T>>(leftReference);
  const rightArray = changetype<StaticArray<T>>(rightReference);
  const length = leftArray.length;

  if (length != rightArray.length) {
    result = StrictEqualityResult.Fail;
  } else {
    for (let i = 0; i < length; i++) {
      if (
        compareStrictEqualityValue<T>(
          unchecked(leftArray[i]),
          unchecked(rightArray[i]),
        ) == StrictEqualityResult.Fail
      ) {
        result = StrictEqualityResult.Fail;
        break;
      }
    }
  }

  popActiveStrictEqualityReferencePair();

  if (result == StrictEqualityResult.Match) {
    recordProvenStrictEqualityReferencePair(leftReference, rightReference);
  }

  return result;
}

export function compareStrictEqualityValue<T>(
  left: T,
  right: T,
): StrictEqualityResult {
  if (isReference<T>()) {
    const leftReference = changetype<usize>(left);
    const rightReference = changetype<usize>(right);

    if (leftReference == rightReference) {
      return StrictEqualityResult.Match;
    }

    if (leftReference == 0 || rightReference == 0) {
      return StrictEqualityResult.Fail;
    }

    if (isString<T>()) {
      return compareStrictEqualityString(
        changetype<string>(left),
        changetype<string>(right),
      );
    }

    if (idof<T>() == idof<ArrayBuffer>()) {
      return compareStrictEqualityArrayBuffer(
        changetype<ArrayBuffer | null>(left),
        changetype<ArrayBuffer | null>(right),
      );
    }

    if (isArray<T>()) {
      return compareStrictEqualityArray<valueof<T>>(
        changetype<Array<valueof<T>>>(left),
        changetype<Array<valueof<T>>>(right),
      );
    }

    if (left instanceof StaticArray) {
      return compareStrictEqualityStaticArray<valueof<T>>(
        changetype<StaticArray<valueof<T>>>(left),
        changetype<StaticArray<valueof<T>>>(right),
      );
    }

    if (ArrayBuffer.isView(left)) {
      return StrictEqualityResult.Fail;
    }

    if (left instanceof Set || left instanceof Map || isFunction<T>()) {
      return StrictEqualityResult.Fail;
    }

    if (isManaged<T>()) {
      return compareStrictEqualityManagedClass(left, right);
    }

    return compareStrictEqualityNullableReference(left, right);
  }

  return compareStrictEqualityPrimitive(left, right);
}

export function resetStrictEqualityReferencePairTracking(): void {
  activeStrictEqualityReferencePairs.length = 0;
  provenStrictEqualityReferencePairs.length = 0;
}

export function getActiveStrictEqualityReferencePairCount(): i32 {
  return activeStrictEqualityReferencePairs.length >> 1;
}

export function getProvenStrictEqualityReferencePairCount(): i32 {
  return provenStrictEqualityReferencePairs.length >> 1;
}

export function hasActiveStrictEqualityReferencePair(
  left: usize,
  right: usize,
): bool {
  return (
    findStrictEqualityReferencePairIndex(
      activeStrictEqualityReferencePairs,
      left,
      right,
    ) >= 0
  );
}

export function hasProvenStrictEqualityReferencePair(
  left: usize,
  right: usize,
): bool {
  return (
    findStrictEqualityReferencePairIndex(
      provenStrictEqualityReferencePairs,
      left,
      right,
    ) >= 0
  );
}

function pushActiveStrictEqualityReferencePair(left: usize, right: usize): void {
  activeStrictEqualityReferencePairs.push(left);
  activeStrictEqualityReferencePairs.push(right);
}

function popActiveStrictEqualityReferencePair(): void {
  activeStrictEqualityReferencePairs.pop();
  activeStrictEqualityReferencePairs.pop();
}

function recordProvenStrictEqualityReferencePair(
  left: usize,
  right: usize,
): void {
  if (hasProvenStrictEqualityReferencePair(left, right)) {
    return;
  }

  provenStrictEqualityReferencePairs.push(left);
  provenStrictEqualityReferencePairs.push(right);
}

export function compareStrictEqualityReferencePair(
  left: usize,
  right: usize,
  comparePair: StrictEqualityReferencePairComparator,
): StrictEqualityResult {
  if (left == right) {
    return StrictEqualityResult.Match;
  }

  if (left == 0 || right == 0) {
    return StrictEqualityResult.Fail;
  }

  if (hasProvenStrictEqualityReferencePair(left, right)) {
    return StrictEqualityResult.Match;
  }

  if (hasActiveStrictEqualityReferencePair(left, right)) {
    return StrictEqualityResult.Defer;
  }

  pushActiveStrictEqualityReferencePair(left, right);
  const result = comparePair(left, right);
  popActiveStrictEqualityReferencePair();

  if (result == StrictEqualityResult.Match) {
    recordProvenStrictEqualityReferencePair(left, right);
  }

  return result;
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

export function compareStrictEqualityManagedClass<T>(
  left: T,
  right: T,
): StrictEqualityResult {
  const leftReference = changetype<usize>(left);
  const rightReference = changetype<usize>(right);

  if (leftReference == rightReference) {
    return StrictEqualityResult.Match;
  }

  if (leftReference == 0 || rightReference == 0) {
    return StrictEqualityResult.Fail;
  }

  if (hasProvenStrictEqualityReferencePair(leftReference, rightReference)) {
    return StrictEqualityResult.Match;
  }

  if (hasActiveStrictEqualityReferencePair(leftReference, rightReference)) {
    return StrictEqualityResult.Defer;
  }

  pushActiveStrictEqualityReferencePair(leftReference, rightReference);
  const result = changetype<nonnull<T>>(
    leftReference,
  ).__asHarnessStrictEquals(rightReference)
    ? StrictEqualityResult.Match
    : StrictEqualityResult.Fail;
  popActiveStrictEqualityReferencePair();

  if (result == StrictEqualityResult.Match) {
    recordProvenStrictEqualityReferencePair(leftReference, rightReference);
  }

  return result;
}

export function __asHarnessStrictEqualsMember<T>(
  _memberHash: string,
  left: T,
  right: T,
): bool {
  return compareStrictEqualityValue(left, right) != StrictEqualityResult.Fail;
}

export function __asHarnessStrictEqualsArrayBufferMember(
  _memberHash: string,
  left: ArrayBuffer | null,
  right: ArrayBuffer | null,
): bool {
  return compareStrictEqualityArrayBuffer(left, right) != StrictEqualityResult.Fail;
}

export function __asHarnessStrictEqualsManagedClassMember<T>(
  _memberHash: string,
  left: T,
  right: T,
): bool {
  return compareStrictEqualityManagedClass(left, right) != StrictEqualityResult.Fail;
}

export function __asHarnessAddReflectedValueKeyValuePair<T>(
  _memberHash: string,
  _value: T,
): void {}
