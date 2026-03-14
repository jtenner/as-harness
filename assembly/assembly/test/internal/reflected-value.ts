import { memory } from "memory";
import {
  ReflectedValue,
  ReflectedValueEntry,
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

@unmanaged
class ReflectedValueUnmanagedPlain {
  value: i32 = 0;
}

@unmanaged
class ReflectedValueUnmanagedOverride {
  value: i32 = 0;

  __asHarnessAddReflectedValueKeyValuePairs(): void {
    addReflectedValueKeyValuePair("field:value", this.value);
  }
}

@unmanaged
class ReflectedValueUnmanagedArrayLike {
  first: i32 = 0;
  second: i32 = 0;

  get length(): i32 {
    return 2;
  }

  @operator("[]")
  __get(index: i32): i32 {
    return index == 0 ? this.first : this.second;
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
  assert(isSupportedReflectedValueKind(ReflectedValueKind.Set));
  assert(isSupportedReflectedValueKind(ReflectedValueKind.Map));
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

  const unmanagedArrayLike = new ReflectedValueUnmanagedArrayLike();
  unmanagedArrayLike.first = 6;
  unmanagedArrayLike.second = 7;
  reflected =
    createReflectedValue<ReflectedValueUnmanagedArrayLike>(
      unmanagedArrayLike,
    );
  assert(reflected.kind == ReflectedValueKind.ArrayLike);
  assert(reflected.runtimeTypeId == 0);
  assert(reflected.values !== null);
  const unmanagedValues = changetype<Array<ReflectedValue>>(reflected.values);
  assert(unmanagedValues.length == 2);
  assert(unmanagedValues[0].signedIntegerValue == 6);
  assert(unmanagedValues[1].signedIntegerValue == 7);
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

function testSetReflectedValues(): void {
  const value = new Set<i32>();
  value.add(4);
  value.add(5);

  let reflected = createReflectedValue<Set<i32>>(value);
  assert(reflected.kind == ReflectedValueKind.Set);
  assert(reflected.runtimeTypeId == idof<Set<i32>>());
  assert(reflected.values !== null);
  const setValues = changetype<Array<ReflectedValue>>(reflected.values);
  assert(setValues.length == 2);
  assert(setValues[0].signedIntegerValue == 4);
  assert(setValues[1].signedIntegerValue == 5);

  const nested = new Set<Array<i32>>();
  nested.add([1, 2]);
  reflected = createReflectedValue<Set<Array<i32>>>(nested);
  assert(reflected.kind == ReflectedValueKind.Set);
  assert(reflected.values !== null);
  const nestedValues = changetype<Array<ReflectedValue>>(reflected.values);
  assert(nestedValues.length == 1);
  assert(nestedValues[0].kind == ReflectedValueKind.ArrayLike);

  const recursive = new Set<Set<i32>>();
  recursive.add(changetype<Set<i32>>(changetype<usize>(recursive)));
  resetReflectedValueTracking();
  reflected = createReflectedValue(recursive);
  assert(reflected.kind == ReflectedValueKind.Set);
  assert(reflected.values !== null);
  const recursiveValues = changetype<Array<ReflectedValue>>(reflected.values);
  assert(recursiveValues.length == 1);
  assert(recursiveValues[0].kind == ReflectedValueKind.CircularReference);
}

function testMapReflectedValues(): void {
  const value = new Map<i32, string>();
  value.set(1, "one");
  value.set(2, "two");

  let reflected = createReflectedValue<Map<i32, string>>(value);
  assert(reflected.kind == ReflectedValueKind.Map);
  assert(reflected.runtimeTypeId == idof<Map<i32, string>>());
  assert(reflected.entries !== null);
  const entries = changetype<Array<ReflectedValueEntry>>(reflected.entries);
  assert(entries.length == 2);
  assert(entries[0].key.kind == ReflectedValueKind.Integer);
  assert(entries[0].key.signedIntegerValue == 1);
  assert(entries[0].value.kind == ReflectedValueKind.String);
  assert(entries[0].value.stringValue == "one");
  assert(entries[1].key.signedIntegerValue == 2);
  assert(entries[1].value.stringValue == "two");

  const nested = new Map<string, Array<i32>>();
  nested.set("numbers", [3, 4]);
  reflected = createReflectedValue<Map<string, Array<i32>>>(nested);
  assert(reflected.kind == ReflectedValueKind.Map);
  assert(reflected.entries !== null);
  const nestedEntries = changetype<Array<ReflectedValueEntry>>(reflected.entries);
  assert(nestedEntries.length == 1);
  assert(nestedEntries[0].key.kind == ReflectedValueKind.String);
  assert(nestedEntries[0].value.kind == ReflectedValueKind.ArrayLike);

  const recursive = new Map<string, Map<string, i32>>();
  recursive.set(
    "self",
    changetype<Map<string, i32>>(changetype<usize>(recursive)),
  );
  resetReflectedValueTracking();
  reflected = createReflectedValue(recursive);
  assert(reflected.kind == ReflectedValueKind.Map);
  assert(reflected.entries !== null);
  const recursiveEntries = changetype<Array<ReflectedValueEntry>>(reflected.entries);
  assert(recursiveEntries.length == 1);
  assert(recursiveEntries[0].value.kind == ReflectedValueKind.CircularReference);
}

function testUnsupportedReflectedValues(): void {
  const functionReflected = createReflectedValue<() => i32>(
    reflectedValueFunction,
  );
  assert(functionReflected.kind == ReflectedValueKind.Unsupported);

  const plainUnmanaged = new ReflectedValueUnmanagedPlain();
  plainUnmanaged.value = 7;
  const unmanagedReflected =
    createReflectedValue<ReflectedValueUnmanagedPlain>(plainUnmanaged);
  assert(unmanagedReflected.kind == ReflectedValueKind.Unsupported);
  assert(unmanagedReflected.runtimeTypeId == 0);
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
  assert(safeRootPairs[3].value.kind == ReflectedValueKind.ManagedClass);
  assert(getActiveReflectedValueKeyValuePairCollectionDepth() == 0);
}

function testClassHookReflectedValues(): void {
  const leaf = new ReflectedValueLeaf("leaf");
  resetReflectedValueTracking();

  let reflected = createReflectedValue<ReflectedValueLeaf>(leaf);
  assert(reflected.kind == ReflectedValueKind.ManagedClass);
  assert(reflected.runtimeTypeId == idof<ReflectedValueLeaf>());
  assert(reflected.keyValuePairs !== null);
  let leafPairs = changetype<Array<ReflectedValueKeyValuePair>>(
    reflected.keyValuePairs,
  );
  assert(leafPairs.length == 1);
  assert(leafPairs[0].key == "field:label");
  assert(leafPairs[0].value.kind == ReflectedValueKind.String);
  assert(leafPairs[0].value.stringValue == "leaf");
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
  reflected = createReflectedValue<ReflectedValueNode>(root);
  assert(reflected.kind == ReflectedValueKind.ManagedClass);
  assert(reflected.runtimeTypeId == idof<ReflectedValueNode>());
  assert(reflected.keyValuePairs !== null);
  const rootPairs = changetype<Array<ReflectedValueKeyValuePair>>(
    reflected.keyValuePairs,
  );
  assert(rootPairs.length == 4);
  assert(rootPairs[0].key == "field:count");
  assert(rootPairs[0].value.signedIntegerValue == 1);
  assert(rootPairs[1].key == "field:label");
  assert(rootPairs[1].value.stringValue == "root");
  assert(rootPairs[2].key == "field:payload");
  assert(rootPairs[2].value.kind == ReflectedValueKind.ArrayBuffer);
  assert(rootPairs[3].key == "field:next");
  assert(rootPairs[3].value.kind == ReflectedValueKind.ManagedClass);
  assert(rootPairs[3].value.keyValuePairs !== null);
  const childPairs = changetype<Array<ReflectedValueKeyValuePair>>(
    rootPairs[3].value.keyValuePairs,
  );
  assert(childPairs.length == 4);
  assert(childPairs[1].value.stringValue == "child");
  assert(childPairs[3].value.kind == ReflectedValueKind.CircularReference);
  assert(getActiveReflectedValueKeyValuePairCollectionDepth() == 0);

  const unmanaged = new ReflectedValueUnmanagedOverride();
  unmanaged.value = 42;
  resetReflectedValueTracking();
  reflected = createReflectedValue<ReflectedValueUnmanagedOverride>(unmanaged);
  assert(reflected.kind == ReflectedValueKind.ManagedClass);
  assert(reflected.runtimeTypeId == 0);
  assert(reflected.keyValuePairs !== null);
  const unmanagedPairs = changetype<Array<ReflectedValueKeyValuePair>>(
    reflected.keyValuePairs,
  );
  assert(unmanagedPairs.length == 1);
  assert(unmanagedPairs[0].key == "field:value");
  assert(unmanagedPairs[0].value.kind == ReflectedValueKind.Integer);
  assert(unmanagedPairs[0].value.signedIntegerValue == 42);
  assert(getActiveReflectedValueKeyValuePairCollectionDepth() == 0);
}

testReflectedValueKinds();
testPrimitiveReflectedValues();
testStringAndArrayBufferReflectedValues();
testArrayLikeReflectedValues();
testArrayBufferViewReflectedValues();
testSetReflectedValues();
testMapReflectedValues();
testUnsupportedReflectedValues();
testManagedClassReflectedValues();
testClassHookReflectedValues();
