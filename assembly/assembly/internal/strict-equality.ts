import { memory } from "memory";
import { OBJECT, TOTAL_OVERHEAD } from "rt/common";
import { addReflectedValueKeyValuePair } from "./reflected-value";

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
export const STRICT_EQUALS_ARRAY_BUFFER_VIEW_MEMBER_HELPER_NAME =
  "__asHarnessStrictEqualsArrayBufferViewMember";
export const STRICT_EQUALS_SET_MEMBER_HELPER_NAME =
  "__asHarnessStrictEqualsSetMember";
export const STRICT_EQUALS_MAP_MEMBER_HELPER_NAME =
  "__asHarnessStrictEqualsMapMember";
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

function compareStrictEqualityHookedClass<T>(
  leftReference: usize,
  rightReference: usize,
): StrictEqualityResult {
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
  let result = StrictEqualityResult.Fail;
  // @ts-ignore The hook may be supplied either by the transform or explicitly
  // by consumer-defined types.
  if (isDefined(changetype<nonnull<T>>(leftReference).__asHarnessStrictEquals)) {
    // @ts-ignore The hook may be supplied either by the transform or explicitly
    // by consumer-defined types.
    result = changetype<nonnull<T>>(leftReference).__asHarnessStrictEquals(
      rightReference,
    )
      ? StrictEqualityResult.Match
      : StrictEqualityResult.Fail;
  }
  popActiveStrictEqualityReferencePair();

  if (result == StrictEqualityResult.Match) {
    recordProvenStrictEqualityReferencePair(leftReference, rightReference);
  }

  return result;
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

export function compareStrictEqualityArrayBufferView(
  left: ArrayBufferView | null,
  right: ArrayBufferView | null,
): StrictEqualityResult {
  if (left == right) {
    return StrictEqualityResult.Match;
  }

  const leftReference = changetype<usize>(left);
  const rightReference = changetype<usize>(right);

  if (leftReference == 0 || rightReference == 0) {
    return StrictEqualityResult.Fail;
  }

  if (getStrictEqualityRuntimeTypeId(leftReference) != getStrictEqualityRuntimeTypeId(rightReference)) {
    return StrictEqualityResult.Fail;
  }

  const leftView = changetype<ArrayBufferView>(leftReference);
  const rightView = changetype<ArrayBufferView>(rightReference);
  const byteLength = leftView.byteLength;

  if (byteLength != rightView.byteLength) {
    return StrictEqualityResult.Fail;
  }

  if (byteLength == 0) {
    return StrictEqualityResult.Match;
  }

  return memory.compare(leftView.dataStart, rightView.dataStart, <usize>byteLength) == 0
    ? StrictEqualityResult.Match
    : StrictEqualityResult.Fail;
}

export function compareStrictEqualitySet<T>(
  left: Set<T> | null,
  right: Set<T> | null,
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
  const leftSet = changetype<Set<T>>(leftReference);
  const rightSet = changetype<Set<T>>(rightReference);

  if (leftSet.size != rightSet.size) {
    result = StrictEqualityResult.Fail;
  } else {
    const leftValues = leftSet.values();
    const rightValues = rightSet.values();
    const length = leftValues.length;

    for (let i = 0; i < length; i++) {
      if (
        compareStrictEqualityValue<T>(leftValues[i], rightValues[i]) ==
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

export function compareStrictEqualityFunctionReference<T>(
  left: T,
  right: T,
): StrictEqualityResult {
  return changetype<usize>(left) == changetype<usize>(right)
    ? StrictEqualityResult.Match
    : StrictEqualityResult.Fail;
}

export function compareStrictEqualityMap<K, V>(
  left: Map<K, V> | null,
  right: Map<K, V> | null,
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
  const leftMap = changetype<Map<K, V>>(leftReference);
  const rightMap = changetype<Map<K, V>>(rightReference);

  if (leftMap.size != rightMap.size) {
    result = StrictEqualityResult.Fail;
  } else {
    const leftKeys = leftMap.keys();
    const rightKeys = rightMap.keys();
    const leftValues = leftMap.values();
    const rightValues = rightMap.values();
    const length = leftKeys.length;

    for (let i = 0; i < length; i++) {
      if (
        compareStrictEqualityValue<K>(leftKeys[i], rightKeys[i]) ==
          StrictEqualityResult.Fail ||
        compareStrictEqualityValue<V>(leftValues[i], rightValues[i]) ==
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

export function compareStrictEqualityArrayLike<T>(left: T, right: T): StrictEqualityResult {
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
  // @ts-ignore `isArrayLike<T>()` guarantees `length` and index access.
  const length = left.length;
  // @ts-ignore `isArrayLike<T>()` guarantees `length` and index access.
  if (length != right.length) {
    result = StrictEqualityResult.Fail;
  } else {
    for (let i = 0; i < length; i++) {
      if (
        compareStrictEqualityValue<valueof<T>>(
          // @ts-ignore `isArrayLike<T>()` guarantees indexed access.
          unchecked(left[i]),
          // @ts-ignore `isArrayLike<T>()` guarantees indexed access.
          unchecked(right[i]),
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

    if (isManaged<T>()) {
      if (idof<T>() == idof<ArrayBuffer>()) {
        return compareStrictEqualityArrayBuffer(
          changetype<ArrayBuffer | null>(left),
          changetype<ArrayBuffer | null>(right),
        );
      }
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
      return compareStrictEqualityArrayBufferView(
        changetype<ArrayBufferView | null>(left),
        changetype<ArrayBufferView | null>(right),
      );
    }

    if (isArrayLike<T>()) {
      return compareStrictEqualityArrayLike<T>(left, right);
    }

    if (isFunction<T>()) {
      return compareStrictEqualityFunctionReference(left, right);
    }

    if (left instanceof Set) {
      return compareStrictEqualitySet<indexof<T>>(
        changetype<Set<indexof<T>> | null>(left),
        changetype<Set<indexof<T>> | null>(right),
      );
    }

    if (left instanceof Map) {
      return compareStrictEqualityMap<indexof<T>, valueof<T>>(
        changetype<Map<indexof<T>, valueof<T>> | null>(left),
        changetype<Map<indexof<T>, valueof<T>> | null>(right),
      );
    }

    if (isManaged<T>()) {
      return compareStrictEqualityManagedClass(left, right);
    }

    return compareStrictEqualityHookedClass<T>(leftReference, rightReference);
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
  return compareStrictEqualityHookedClass<T>(
    changetype<usize>(left),
    changetype<usize>(right),
  );
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

export function __asHarnessStrictEqualsArrayBufferViewMember<T>(
  _memberHash: string,
  left: T,
  right: T,
): bool {
  return compareStrictEqualityArrayBufferView(
    changetype<ArrayBufferView | null>(left),
    changetype<ArrayBufferView | null>(right),
  ) != StrictEqualityResult.Fail;
}

export function __asHarnessStrictEqualsSetMember<T>(
  _memberHash: string,
  left: Set<T> | null,
  right: Set<T> | null,
): bool {
  return compareStrictEqualitySet(left, right) != StrictEqualityResult.Fail;
}

export function __asHarnessStrictEqualsMapMember<K, V>(
  _memberHash: string,
  left: Map<K, V> | null,
  right: Map<K, V> | null,
): bool {
  return compareStrictEqualityMap(left, right) != StrictEqualityResult.Fail;
}

export function __asHarnessStrictEqualsManagedClassMember<T>(
  _memberHash: string,
  left: T,
  right: T,
): bool {
  return compareStrictEqualityManagedClass(left, right) != StrictEqualityResult.Fail;
}

export function __asHarnessAddReflectedValueKeyValuePair<T>(
  memberHash: string,
  value: T,
): void {
  addReflectedValueKeyValuePair(memberHash, value);
}
