import { memory } from "memory";
import {
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

function testReflectedValueKinds(): void {
  assert(isSupportedReflectedValueKind(ReflectedValueKind.Null));
  assert(isSupportedReflectedValueKind(ReflectedValueKind.Boolean));
  assert(isSupportedReflectedValueKind(ReflectedValueKind.Integer));
  assert(isSupportedReflectedValueKind(ReflectedValueKind.Float));
  assert(isSupportedReflectedValueKind(ReflectedValueKind.String));
  assert(isSupportedReflectedValueKind(ReflectedValueKind.ArrayBuffer));
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

function testUnsupportedReflectedValues(): void {
  const arrayReflected = createReflectedValue<Array<i32>>([1, 2, 3]);
  assert(arrayReflected.kind == ReflectedValueKind.Unsupported);

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
testUnsupportedReflectedValues();
testManagedClassReflectedValues();
