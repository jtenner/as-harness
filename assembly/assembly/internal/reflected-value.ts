import { memory } from "memory";
import { OBJECT, TOTAL_OVERHEAD } from "rt/common";

export const enum ReflectedValueKind {
  Null = 1,
  Boolean = 2,
  Integer = 3,
  Float = 4,
  String = 5,
  ArrayBuffer = 6,
  ManagedClass = 7,
  CircularReference = 8,
  Unsupported = 9,
}

export class ReflectedValueKeyValuePair {
  key: string;
  value: ReflectedValue;

  constructor(key: string, value: ReflectedValue) {
    this.key = key;
    this.value = value;
  }
}

export class ReflectedValue {
  kind: ReflectedValueKind;
  booleanValue: bool = false;
  signedIntegerValue: i64 = 0;
  unsignedIntegerValue: u64 = 0;
  integerIsSigned: bool = false;
  floatValue: f64 = 0.0;
  stringValue: string | null = null;
  byteLength: i32 = 0;
  bytes: ArrayBuffer | null = null;
  runtimeTypeId: u32 = 0;
  keyValuePairs: Array<ReflectedValueKeyValuePair> | null = null;

  constructor(kind: ReflectedValueKind) {
    this.kind = kind;
  }
}

const activeReflectedValueKeyValuePairCollections =
  new Array<Array<ReflectedValueKeyValuePair>>();

function cloneArrayBuffer(value: ArrayBuffer): ArrayBuffer {
  const byteLength = value.byteLength;
  const clone = new ArrayBuffer(byteLength);

  if (byteLength > 0) {
    memory.copy(
      changetype<usize>(clone),
      changetype<usize>(value),
      <usize>byteLength,
    );
  }

  return clone;
}

function pushActiveReflectedValueKeyValuePairCollection(
  keyValuePairs: Array<ReflectedValueKeyValuePair>,
): void {
  activeReflectedValueKeyValuePairCollections.push(keyValuePairs);
}

function popActiveReflectedValueKeyValuePairCollection(): void {
  activeReflectedValueKeyValuePairCollections.pop();
}

function currentReflectedValueKeyValuePairCollection(): Array<ReflectedValueKeyValuePair> | null {
  const depth = activeReflectedValueKeyValuePairCollections.length;
  return depth > 0
    ? unchecked(activeReflectedValueKeyValuePairCollections[depth - 1])
    : null;
}

export function isSupportedReflectedValueKind(kind: ReflectedValueKind): bool {
  return (
    kind == ReflectedValueKind.Null ||
    kind == ReflectedValueKind.Boolean ||
    kind == ReflectedValueKind.Integer ||
    kind == ReflectedValueKind.Float ||
    kind == ReflectedValueKind.String ||
    kind == ReflectedValueKind.ArrayBuffer ||
    kind == ReflectedValueKind.ManagedClass ||
    kind == ReflectedValueKind.CircularReference ||
    kind == ReflectedValueKind.Unsupported
  );
}

export function resetReflectedValueTracking(): void {
  activeReflectedValueKeyValuePairCollections.length = 0;
}

export function getActiveReflectedValueKeyValuePairCollectionDepth(): i32 {
  return activeReflectedValueKeyValuePairCollections.length;
}

export function getReflectedValueRuntimeTypeId(reference: usize): u32 {
  if (reference == 0) {
    return 0;
  }

  return changetype<OBJECT>(reference - TOTAL_OVERHEAD).rtId;
}

export function createNullReflectedValue(): ReflectedValue {
  return new ReflectedValue(ReflectedValueKind.Null);
}

export function createBooleanReflectedValue(value: bool): ReflectedValue {
  const reflected = new ReflectedValue(ReflectedValueKind.Boolean);
  reflected.booleanValue = value;
  return reflected;
}

export function createIntegerReflectedValue<T>(value: T): ReflectedValue {
  const reflected = new ReflectedValue(ReflectedValueKind.Integer);
  reflected.integerIsSigned = isSigned<T>();

  if (reflected.integerIsSigned) {
    reflected.signedIntegerValue = <i64>value;
  } else {
    reflected.unsignedIntegerValue = <u64>value;
  }

  return reflected;
}

export function createFloatReflectedValue<T>(value: T): ReflectedValue {
  const reflected = new ReflectedValue(ReflectedValueKind.Float);
  reflected.floatValue = sizeof<T>() == sizeof<f32>()
    ? <f64><f32>value
    : <f64>value;
  return reflected;
}

export function createStringReflectedValue(
  value: string | null,
): ReflectedValue {
  if (value === null) {
    return createNullReflectedValue();
  }

  const reflected = new ReflectedValue(ReflectedValueKind.String);
  reflected.stringValue = value;
  return reflected;
}

export function createArrayBufferReflectedValue(
  value: ArrayBuffer | null,
): ReflectedValue {
  if (value === null) {
    return createNullReflectedValue();
  }

  const reflected = new ReflectedValue(ReflectedValueKind.ArrayBuffer);
  reflected.byteLength = value.byteLength;
  reflected.bytes = cloneArrayBuffer(value);
  return reflected;
}

export function createCircularReferenceReflectedValue(
  reference: usize,
): ReflectedValue {
  const reflected = new ReflectedValue(ReflectedValueKind.CircularReference);
  reflected.runtimeTypeId = getReflectedValueRuntimeTypeId(reference);
  return reflected;
}

export function createUnsupportedReflectedValue(reference: usize = 0): ReflectedValue {
  const reflected = new ReflectedValue(ReflectedValueKind.Unsupported);
  reflected.runtimeTypeId = getReflectedValueRuntimeTypeId(reference);
  return reflected;
}

export function beginReflectedValueKeyValuePairCollection(): void {
  pushActiveReflectedValueKeyValuePairCollection(
    new Array<ReflectedValueKeyValuePair>(),
  );
}

export function finishReflectedValueKeyValuePairCollection(): Array<ReflectedValueKeyValuePair> | null {
  const keyValuePairs = currentReflectedValueKeyValuePairCollection();

  if (keyValuePairs === null) {
    return null;
  }

  popActiveReflectedValueKeyValuePairCollection();
  return keyValuePairs;
}

export function createReflectedValue<T>(value: T): ReflectedValue {
  if (isReference<T>()) {
    const reference = changetype<usize>(value);

    if (reference == 0) {
      return createNullReflectedValue();
    }

    if (isString<T>()) {
      return createStringReflectedValue(changetype<string | null>(value));
    }

    if (idof<T>() == idof<ArrayBuffer>()) {
      return createArrayBufferReflectedValue(
        changetype<ArrayBuffer | null>(value),
      );
    }

    if (
      isArray<T>() ||
      value instanceof StaticArray ||
      ArrayBuffer.isView(value) ||
      value instanceof Set ||
      value instanceof Map ||
      isFunction<T>()
    ) {
      return createUnsupportedReflectedValue(reference);
    }

    return createUnsupportedReflectedValue(reference);
  }

  if (isBoolean<T>()) {
    return createBooleanReflectedValue(<bool>value);
  }

  if (isInteger<T>()) {
    return createIntegerReflectedValue(value);
  }

  if (isFloat<T>()) {
    return createFloatReflectedValue(value);
  }

  return createUnsupportedReflectedValue();
}

export function addReflectedValueKeyValuePair<T>(
  memberHash: string,
  value: T,
): void {
  const keyValuePairs = currentReflectedValueKeyValuePairCollection();

  if (keyValuePairs === null) {
    return;
  }

  keyValuePairs.push(
    new ReflectedValueKeyValuePair(memberHash, createReflectedValue(value)),
  );
}
