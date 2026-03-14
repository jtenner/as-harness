import { memory } from "memory";
import {
  ReflectedValue,
  ReflectedValueKind,
  ReflectedValueKeyValuePair,
  addReflectedValueKeyValuePair,
  beginReflectedValueKeyValuePairCollection,
  createReflectedValue,
  getActiveReflectedValueKeyValuePairCollectionDepth,
  finishReflectedValueKeyValuePairCollection,
  isSupportedReflectedValueKind,
  resetReflectedValueTracking,
} from "../../internal/reflected-value";

function reflectedValueFunction(): i32 {
  return 1;
}

class ReflectedValueLeaf {
  label: string;

  constructor(label: string) {
    this.label = label;
  }

  __asHarnessAddReflectedValueKeyValuePairs(): void {
    addReflectedValueKeyValuePair("field:label", this.label);
  }
}

class ReflectedValueNode {
  count: i32;
  label: string;
  payload: ArrayBuffer;
  next: ReflectedValueNode | null = null;

  constructor(count: i32, label: string, payload: ArrayBuffer) {
    this.count = count;
    this.label = label;
    this.payload = payload;
  }

  __asHarnessAddReflectedValueKeyValuePairs(): void {
    addReflectedValueKeyValuePair("field:count", this.count);
    addReflectedValueKeyValuePair("field:label", this.label);
    addReflectedValueKeyValuePair("field:payload", this.payload);
    addReflectedValueKeyValuePair("field:next", this.next);
  }
}

function createArrayBufferFromBytes(values: StaticArray<u8>): ArrayBuffer {
  const output = new ArrayBuffer(values.length);
  memory.copy(
    changetype<usize>(output),
    changetype<usize>(values),
    <usize>values.length,
  );
  return output;
}

function createUint8Array(values: StaticArray<u8>): Uint8Array {
  const output = new Uint8Array(values.length);
  for (let i = 0; i < values.length; i++) {
    output[i] = unchecked(values[i]);
  }
  return output;
}

function testReflectedValueKinds(): void {
  assert(isSupportedReflectedValueKind(ReflectedValueKind.Null));
  assert(isSupportedReflectedValueKind(ReflectedValueKind.Boolean));
  assert(isSupportedReflectedValueKind(ReflectedValueKind.Integer));
  assert(isSupportedReflectedValueKind(ReflectedValueKind.Float));
  assert(isSupportedReflectedValueKind(ReflectedValueKind.String));
  assert(isSupportedReflectedValueKind(ReflectedValueKind.ArrayBuffer));
  assert(isSupportedReflectedValueKind(ReflectedValueKind.ArrayLike));
  assert(isSupportedReflectedValueKind(ReflectedValueKind.ArrayBufferView));
  assert(isSupportedReflectedValueKind(ReflectedValueKind.ManagedClass));
  assert(isSupportedReflectedValueKind(ReflectedValueKind.CircularReference));
  assert(isSupportedReflectedValueKind(ReflectedValueKind.Unsupported));
}

function testPrimitiveReflectedValues(): void {
  let reflected = createReflectedValue<bool>(true);
  assert(reflected.kind == ReflectedValueKind.Boolean);
  assert(reflected.booleanValue);

  reflected = createReflectedValue<i32>(-42);
  assert(reflected.kind == ReflectedValueKind.Integer);
  assert(reflected.integerIsSigned);
  assert(reflected.signedIntegerValue == -42);

  reflected = createReflectedValue<u32>(42);
  assert(reflected.kind == ReflectedValueKind.Integer);
  assert(!reflected.integerIsSigned);
  assert(reflected.unsignedIntegerValue == 42);

  reflected = createReflectedValue<f64>(1.25);
  assert(reflected.kind == ReflectedValueKind.Float);
  assert(reflected.floatValue == 1.25);
}

function testStringAndArrayBufferReflectedValues(): void {
  let reflected = createReflectedValue<string>("value");
  assert(reflected.kind == ReflectedValueKind.String);
  assert(reflected.stringValue == "value");

  reflected = createReflectedValue<string | null>(null);
  assert(reflected.kind == ReflectedValueKind.Null);

  const bytes = createArrayBufferFromBytes([1, 2, 3]);
  reflected = createReflectedValue<ArrayBuffer>(bytes);
  assert(reflected.kind == ReflectedValueKind.ArrayBuffer);
  assert(reflected.byteLength == 3);
  assert(reflected.bytes !== null);
  assert(load<u8>(changetype<usize>(reflected.bytes)) == 1);
  assert(load<u8>(changetype<usize>(reflected.bytes) + 1) == 2);
  assert(load<u8>(changetype<usize>(reflected.bytes) + 2) == 3);
}

function testArrayLikeReflectedValues(): void {
  let reflected = createReflectedValue<Array<i32>>([1, 2, 3]);
  assert(reflected.kind == ReflectedValueKind.ArrayLike);
  assert(reflected.values !== null);
  const arrayValues = changetype<Array<ReflectedValue>>(reflected.values);
  assert(arrayValues.length == 3);
  assert(arrayValues[0].kind == ReflectedValueKind.Integer);
  assert(arrayValues[0].signedIntegerValue == 1);
  assert(arrayValues[2].signedIntegerValue == 3);

  reflected = createReflectedValue<Array<Array<i32>>>([[1, 2], [3]]);
  assert(reflected.kind == ReflectedValueKind.ArrayLike);
  assert(reflected.values !== null);
  const nestedValues = changetype<Array<ReflectedValue>>(reflected.values);
  assert(nestedValues.length == 2);
  assert(nestedValues[0].kind == ReflectedValueKind.ArrayLike);
  assert(nestedValues[0].values !== null);
  const nestedInnerValues = changetype<Array<ReflectedValue>>(
    nestedValues[0].values,
  );
  assert(nestedInnerValues.length == 2);
  assert(nestedInnerValues[1].signedIntegerValue == 2);

  const staticArray: StaticArray<i32> = [4, 5];
  reflected = createReflectedValue<StaticArray<i32>>(staticArray);
  assert(reflected.kind == ReflectedValueKind.ArrayLike);
  assert(reflected.values !== null);
  const staticValues = changetype<Array<ReflectedValue>>(reflected.values);
  assert(staticValues.length == 2);
  assert(staticValues[0].signedIntegerValue == 4);
  assert(staticValues[1].signedIntegerValue == 5);
}

function testArrayBufferViewReflectedValues(): void {
  let reflected = createReflectedValue<Uint8Array>(createUint8Array([9, 8, 7]));
  assert(reflected.kind == ReflectedValueKind.ArrayBufferView);
  assert(reflected.byteLength == 3);
  assert(reflected.bytes !== null);
  assert(reflected.runtimeTypeId == idof<Uint8Array>());
  assert(load<u8>(changetype<usize>(reflected.bytes)) == 9);
  assert(load<u8>(changetype<usize>(reflected.bytes) + 2) == 7);

  const backing = createArrayBufferFromBytes([1, 2, 3, 4]);
  reflected = createReflectedValue<DataView>(new DataView(backing, 1, 2));
  assert(reflected.kind == ReflectedValueKind.ArrayBufferView);
  assert(reflected.byteLength == 2);
  assert(reflected.bytes !== null);
  assert(reflected.runtimeTypeId == idof<DataView>());
  assert(load<u8>(changetype<usize>(reflected.bytes)) == 2);
  assert(load<u8>(changetype<usize>(reflected.bytes) + 1) == 3);
}

function testUnsupportedReflectedValues(): void {
  const setReflected = createReflectedValue<Set<i32>>(new Set<i32>());
  assert(setReflected.kind == ReflectedValueKind.Unsupported);

  const mapReflected = createReflectedValue<Map<i32, string>>(
    new Map<i32, string>(),
  );
  assert(mapReflected.kind == ReflectedValueKind.Unsupported);

  const functionReflected = createReflectedValue<() => i32>(
    reflectedValueFunction,
  );
  assert(functionReflected.kind == ReflectedValueKind.Unsupported);
}

function testManagedClassReflectedValues(): void {
  const leaf = new ReflectedValueLeaf("leaf");
  resetReflectedValueTracking();

  beginReflectedValueKeyValuePairCollection();
  leaf.__asHarnessAddReflectedValueKeyValuePairs();
  const leafPairs = finishReflectedValueKeyValuePairCollection();
  assert(leafPairs !== null);
  const safeLeafPairs = changetype<Array<ReflectedValueKeyValuePair>>(leafPairs);
  assert(safeLeafPairs.length == 1);
  assert(safeLeafPairs[0].key == "field:label");
  assert(safeLeafPairs[0].value.kind == ReflectedValueKind.String);
  assert(safeLeafPairs[0].value.stringValue == "leaf");
  assert(getActiveReflectedValueKeyValuePairCollectionDepth() == 0);

  const root = new ReflectedValueNode(
    1,
    "root",
    createArrayBufferFromBytes([7, 8, 9]),
  );
  const child = new ReflectedValueNode(
    2,
    "child",
    createArrayBufferFromBytes([1, 2]),
  );
  root.next = child;
  child.next = root;

  resetReflectedValueTracking();
  beginReflectedValueKeyValuePairCollection();
  root.__asHarnessAddReflectedValueKeyValuePairs();
  const rootPairs = finishReflectedValueKeyValuePairCollection();
  assert(rootPairs !== null);
  const safeRootPairs = changetype<Array<ReflectedValueKeyValuePair>>(rootPairs);
  assert(safeRootPairs.length == 4);
  assert(safeRootPairs[0].key == "field:count");
  assert(safeRootPairs[0].value.kind == ReflectedValueKind.Integer);
  assert(safeRootPairs[0].value.signedIntegerValue == 1);
  assert(safeRootPairs[1].key == "field:label");
  assert(safeRootPairs[1].value.stringValue == "root");
  assert(safeRootPairs[2].key == "field:payload");
  assert(safeRootPairs[2].value.kind == ReflectedValueKind.ArrayBuffer);
  assert(safeRootPairs[2].value.byteLength == 3);
  assert(safeRootPairs[3].key == "field:next");
  assert(safeRootPairs[3].value.kind == ReflectedValueKind.Unsupported);
  assert(getActiveReflectedValueKeyValuePairCollectionDepth() == 0);
}

testReflectedValueKinds();
testPrimitiveReflectedValues();
testStringAndArrayBufferReflectedValues();
testArrayLikeReflectedValues();
testArrayBufferViewReflectedValues();
testUnsupportedReflectedValues();
testManagedClassReflectedValues();
