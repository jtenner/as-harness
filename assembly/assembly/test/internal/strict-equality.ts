import {
  __asHarnessAddReflectedValueKeyValuePair,
  __asHarnessHasStrictEqualityRuntimeType,
  __asHarnessStrictEqualsArrayBufferMember,
  __asHarnessStrictEqualsManagedClassMember,
  __asHarnessStrictEqualsMember,
  ADD_REFLECTED_VALUE_KEY_VALUE_PAIRS_METHOD_NAME,
  ADD_REFLECTED_VALUE_KEY_VALUE_PAIR_HELPER_NAME,
  compareStrictEqualityArrayBuffer,
  compareStrictEqualityManagedClass,
  compareStrictEqualityReferencePair,
  compareStrictEqualityString,
  compareStrictEqualityValue,
  compareStrictEqualityNullableReference,
  compareStrictEqualityPrimitive,
  getActiveStrictEqualityReferencePairCount,
  getProvenStrictEqualityReferencePairCount,
  getStrictEqualityRuntimeTypeId,
  hasActiveStrictEqualityReferencePair,
  hasProvenStrictEqualityReferencePair,
  resetStrictEqualityReferencePairTracking,
  STRICT_EQUALS_METHOD_NAME,
  STRICT_EQUALS_ARRAY_BUFFER_MEMBER_HELPER_NAME,
  STRICT_EQUALS_MANAGED_CLASS_MEMBER_HELPER_NAME,
  STRICT_EQUALS_RUNTIME_TYPE_HELPER_NAME,
  STRICT_EQUALS_MEMBER_HELPER_NAME,
  StrictEqualityResult,
  StrictEqualityValueKind,
  isDeferredStrictEqualityResult,
  isSupportedStrictEqualityValueKind,
  isTerminalStrictEqualityResult,
} from "../../internal/strict-equality";

class StrictEqualityReferenceBox {}
class StrictEqualityOtherReferenceBox {}
class StrictEqualityRecursiveNode {
  label: string;
  next: StrictEqualityRecursiveNode | null = null;

  constructor(label: string) {
    this.label = label;
  }

  __asHarnessStrictEquals(other: usize): bool {
    if (other == changetype<usize>(this)) {
      return true;
    }

    if (
      !__asHarnessHasStrictEqualityRuntimeType(
        other,
        idof<StrictEqualityRecursiveNode>(),
      )
    ) {
      return false;
    }

    const otherNode = changetype<StrictEqualityRecursiveNode>(other);
    return (
      __asHarnessStrictEqualsMember("field:label", this.label, otherNode.label) &&
      __asHarnessStrictEqualsManagedClassMember(
        "field:next",
        this.next,
        otherNode.next,
      )
    );
  }
}

let strictEqualityCallbackRuns: i32 = 0;

function returnMatchForStrictEqualityPair(
  _left: usize,
  _right: usize,
): StrictEqualityResult {
  strictEqualityCallbackRuns++;
  return StrictEqualityResult.Match;
}

function returnFailForStrictEqualityPair(
  _left: usize,
  _right: usize,
): StrictEqualityResult {
  strictEqualityCallbackRuns++;
  return StrictEqualityResult.Fail;
}

function reenterStrictEqualityPair(
  left: usize,
  right: usize,
): StrictEqualityResult {
  strictEqualityCallbackRuns++;

  assert(getActiveStrictEqualityReferencePairCount() == 1);
  assert(hasActiveStrictEqualityReferencePair(left, right));
  assert(
    compareStrictEqualityReferencePair(left, right, returnMatchForStrictEqualityPair) ==
      StrictEqualityResult.Defer,
  );

  return StrictEqualityResult.Match;
}

function testStrictEqualityHookNames(): void {
  assert(STRICT_EQUALS_METHOD_NAME == "__asHarnessStrictEquals");
  assert(
    STRICT_EQUALS_ARRAY_BUFFER_MEMBER_HELPER_NAME ==
      "__asHarnessStrictEqualsArrayBufferMember",
  );
  assert(
    STRICT_EQUALS_MANAGED_CLASS_MEMBER_HELPER_NAME ==
      "__asHarnessStrictEqualsManagedClassMember",
  );
  assert(
    ADD_REFLECTED_VALUE_KEY_VALUE_PAIRS_METHOD_NAME ==
      "__asHarnessAddReflectedValueKeyValuePairs",
  );
  assert(STRICT_EQUALS_MEMBER_HELPER_NAME == "__asHarnessStrictEqualsMember");
  assert(
    STRICT_EQUALS_RUNTIME_TYPE_HELPER_NAME ==
      "__asHarnessHasStrictEqualityRuntimeType",
  );
  assert(
    ADD_REFLECTED_VALUE_KEY_VALUE_PAIR_HELPER_NAME ==
      "__asHarnessAddReflectedValueKeyValuePair",
  );
}

function testStrictEqualityResultHelpers(): void {
  assert(isTerminalStrictEqualityResult(StrictEqualityResult.Match));
  assert(isTerminalStrictEqualityResult(StrictEqualityResult.Fail));
  assert(!isTerminalStrictEqualityResult(StrictEqualityResult.Defer));

  assert(!isDeferredStrictEqualityResult(StrictEqualityResult.Match));
  assert(!isDeferredStrictEqualityResult(StrictEqualityResult.Fail));
  assert(isDeferredStrictEqualityResult(StrictEqualityResult.Defer));
}

function testSupportedStrictEqualityValueKinds(): void {
  assert(isSupportedStrictEqualityValueKind(StrictEqualityValueKind.Primitive));
  assert(
    isSupportedStrictEqualityValueKind(
      StrictEqualityValueKind.NullableReference,
    ),
  );
  assert(isSupportedStrictEqualityValueKind(StrictEqualityValueKind.String));
  assert(isSupportedStrictEqualityValueKind(StrictEqualityValueKind.ArrayBuffer));
  assert(isSupportedStrictEqualityValueKind(StrictEqualityValueKind.ArrayLike));
  assert(
    isSupportedStrictEqualityValueKind(
      StrictEqualityValueKind.ArrayBufferView,
    ),
  );
  assert(isSupportedStrictEqualityValueKind(StrictEqualityValueKind.Set));
  assert(isSupportedStrictEqualityValueKind(StrictEqualityValueKind.Map));
  assert(isSupportedStrictEqualityValueKind(StrictEqualityValueKind.ManagedClass));
  assert(
    isSupportedStrictEqualityValueKind(
      StrictEqualityValueKind.FunctionReference,
    ),
  );
}

function testStrictEqualityMemberHelpers(): void {
  assert(__asHarnessStrictEqualsMember("field:value", 42, 42));
  assert(!__asHarnessStrictEqualsMember("field:value", 42, 7));
  __asHarnessAddReflectedValueKeyValuePair("field:value", 42);
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

function createRecursiveCycle(
  rootLabel: string,
  childLabel: string,
): StrictEqualityRecursiveNode {
  const root = new StrictEqualityRecursiveNode(rootLabel);
  const child = new StrictEqualityRecursiveNode(childLabel);
  root.next = child;
  child.next = root;
  return root;
}

function testStrictEqualityPrimitiveComparison(): void {
  assert(
    compareStrictEqualityPrimitive<i32>(1, 1) == StrictEqualityResult.Match,
  );
  assert(
    compareStrictEqualityPrimitive<i32>(1, 2) == StrictEqualityResult.Fail,
  );
  assert(
    compareStrictEqualityPrimitive<bool>(true, true) ==
      StrictEqualityResult.Match,
  );
  assert(
    compareStrictEqualityPrimitive<bool>(true, false) ==
      StrictEqualityResult.Fail,
  );
  assert(
    compareStrictEqualityPrimitive<f32>(NaN, NaN) ==
      StrictEqualityResult.Match,
  );
  assert(
    compareStrictEqualityPrimitive<f32>(NaN, 1.0) ==
      StrictEqualityResult.Fail,
  );
  assert(
    compareStrictEqualityPrimitive<f64>(NaN, NaN) ==
      StrictEqualityResult.Match,
  );
  assert(
    compareStrictEqualityPrimitive<f64>(NaN, 1.0) ==
      StrictEqualityResult.Fail,
  );
}

function testStrictEqualityNullableReferenceComparison(): void {
  const shared = new StrictEqualityReferenceBox();
  const separate = new StrictEqualityReferenceBox();
  const nullLeft = changetype<StrictEqualityReferenceBox | null>(0);
  const nullRight = changetype<StrictEqualityReferenceBox | null>(0);

  assert(
    compareStrictEqualityNullableReference<StrictEqualityReferenceBox | null>(
      nullLeft,
      nullRight,
    ) == StrictEqualityResult.Match,
  );
  assert(
    compareStrictEqualityNullableReference<StrictEqualityReferenceBox | null>(
      shared,
      shared,
    ) == StrictEqualityResult.Match,
  );
  assert(
    compareStrictEqualityNullableReference<StrictEqualityReferenceBox | null>(
      shared,
      separate,
    ) == StrictEqualityResult.Fail,
  );
  assert(
    compareStrictEqualityNullableReference<StrictEqualityReferenceBox | null>(
      shared,
      nullLeft,
    ) == StrictEqualityResult.Fail,
  );
}

function testStrictEqualityStringComparison(): void {
  const left = String.UTF8.decode(String.UTF8.encode("ready"));
  const right = String.UTF8.decode(String.UTF8.encode("ready"));

  assert(
    compareStrictEqualityString(left, right) == StrictEqualityResult.Match,
  );
  assert(
    compareStrictEqualityValue<string>(left, right) ==
      StrictEqualityResult.Match,
  );
  assert(
    compareStrictEqualityValue<string>(left, "steady") ==
      StrictEqualityResult.Fail,
  );
}

function testStrictEqualityArrayBufferComparison(): void {
  const left = createArrayBufferFromBytes([1, 2, 3, 4]);
  const right = createArrayBufferFromBytes([1, 2, 3, 4]);
  const mismatch = createArrayBufferFromBytes([1, 2, 9, 4]);
  const shorter = createArrayBufferFromBytes([1, 2, 3]);
  const emptyLeft = new ArrayBuffer(0);
  const emptyRight = new ArrayBuffer(0);
  const nullBuffer = changetype<ArrayBuffer | null>(0);

  assert(
    compareStrictEqualityArrayBuffer(left, right) == StrictEqualityResult.Match,
  );
  assert(
    compareStrictEqualityArrayBuffer(left, mismatch) ==
      StrictEqualityResult.Fail,
  );
  assert(
    compareStrictEqualityArrayBuffer(left, shorter) ==
      StrictEqualityResult.Fail,
  );
  assert(
    compareStrictEqualityArrayBuffer(emptyLeft, emptyRight) ==
      StrictEqualityResult.Match,
  );
  assert(
    compareStrictEqualityArrayBuffer(left, nullBuffer) ==
      StrictEqualityResult.Fail,
  );
  assert(
    compareStrictEqualityArrayBuffer(nullBuffer, nullBuffer) ==
      StrictEqualityResult.Match,
  );
  assert(
    compareStrictEqualityValue<ArrayBuffer>(left, right) ==
      StrictEqualityResult.Match,
  );
  assert(
    compareStrictEqualityValue<ArrayBuffer>(left, mismatch) ==
      StrictEqualityResult.Fail,
  );
  assert(__asHarnessStrictEqualsArrayBufferMember("field:buffer", left, right));
  assert(
    !__asHarnessStrictEqualsArrayBufferMember("field:buffer", left, mismatch),
  );
}

function testStrictEqualityRuntimeTypeHelpers(): void {
  const value = new StrictEqualityReferenceBox();
  const other = new StrictEqualityOtherReferenceBox();
  const nullValue = 0;

  assert(getStrictEqualityRuntimeTypeId(changetype<usize>(value)) != 0);
  assert(
    getStrictEqualityRuntimeTypeId(changetype<usize>(value)) ==
      idof<StrictEqualityReferenceBox>(),
  );
  assert(getStrictEqualityRuntimeTypeId(nullValue) == 0);
  assert(
    __asHarnessHasStrictEqualityRuntimeType(
      changetype<usize>(value),
      idof<StrictEqualityReferenceBox>(),
    ),
  );
  assert(
    !__asHarnessHasStrictEqualityRuntimeType(
      changetype<usize>(other),
      idof<StrictEqualityReferenceBox>(),
    ),
  );
}

function testStrictEqualityReferencePairTracking(): void {
  const left = new StrictEqualityReferenceBox();
  const right = new StrictEqualityReferenceBox();
  const leftRef = changetype<usize>(left);
  const rightRef = changetype<usize>(right);

  resetStrictEqualityReferencePairTracking();
  strictEqualityCallbackRuns = 0;

  assert(
    compareStrictEqualityReferencePair(leftRef, leftRef, returnFailForStrictEqualityPair) ==
      StrictEqualityResult.Match,
  );
  assert(strictEqualityCallbackRuns == 0);

  assert(
    compareStrictEqualityReferencePair(leftRef, 0, returnMatchForStrictEqualityPair) ==
      StrictEqualityResult.Fail,
  );
  assert(strictEqualityCallbackRuns == 0);

  assert(
    compareStrictEqualityReferencePair(leftRef, rightRef, reenterStrictEqualityPair) ==
      StrictEqualityResult.Match,
  );
  assert(strictEqualityCallbackRuns == 1);
  assert(getActiveStrictEqualityReferencePairCount() == 0);
  assert(getProvenStrictEqualityReferencePairCount() == 1);
  assert(hasProvenStrictEqualityReferencePair(leftRef, rightRef));

  strictEqualityCallbackRuns = 0;
  assert(
    compareStrictEqualityReferencePair(leftRef, rightRef, returnFailForStrictEqualityPair) ==
      StrictEqualityResult.Match,
  );
  assert(strictEqualityCallbackRuns == 0);

  resetStrictEqualityReferencePairTracking();
  strictEqualityCallbackRuns = 0;
  assert(
    compareStrictEqualityReferencePair(leftRef, rightRef, returnFailForStrictEqualityPair) ==
      StrictEqualityResult.Fail,
  );
  assert(strictEqualityCallbackRuns == 1);
  assert(getActiveStrictEqualityReferencePairCount() == 0);
  assert(getProvenStrictEqualityReferencePairCount() == 0);
  assert(!hasProvenStrictEqualityReferencePair(leftRef, rightRef));
}

function testStrictEqualityManagedClassComparison(): void {
  const left = createRecursiveCycle("root", "child");
  const right = createRecursiveCycle("root", "child");
  const mismatch = createRecursiveCycle("root", "other");
  const nullNode = changetype<StrictEqualityRecursiveNode | null>(0);

  resetStrictEqualityReferencePairTracking();
  assert(
    compareStrictEqualityManagedClass(left, right) == StrictEqualityResult.Match,
  );
  assert(getActiveStrictEqualityReferencePairCount() == 0);
  assert(getProvenStrictEqualityReferencePairCount() == 2);

  resetStrictEqualityReferencePairTracking();
  assert(
    __asHarnessStrictEqualsManagedClassMember("field:next", left, right),
  );
  assert(getActiveStrictEqualityReferencePairCount() == 0);
  assert(getProvenStrictEqualityReferencePairCount() == 2);

  resetStrictEqualityReferencePairTracking();
  assert(
    compareStrictEqualityManagedClass(left, mismatch) ==
      StrictEqualityResult.Fail,
  );
  assert(getActiveStrictEqualityReferencePairCount() == 0);
  assert(getProvenStrictEqualityReferencePairCount() == 0);

  resetStrictEqualityReferencePairTracking();
  assert(
    !__asHarnessStrictEqualsManagedClassMember("field:next", left, mismatch),
  );
  assert(getActiveStrictEqualityReferencePairCount() == 0);
  assert(getProvenStrictEqualityReferencePairCount() == 0);

  resetStrictEqualityReferencePairTracking();
  assert(
    __asHarnessStrictEqualsManagedClassMember("field:next", left, left),
  );
  assert(getActiveStrictEqualityReferencePairCount() == 0);
  assert(getProvenStrictEqualityReferencePairCount() == 0);

  resetStrictEqualityReferencePairTracking();
  assert(
    !__asHarnessStrictEqualsManagedClassMember("field:next", left, nullNode),
  );
  assert(getActiveStrictEqualityReferencePairCount() == 0);
}

testStrictEqualityHookNames();
testStrictEqualityResultHelpers();
testSupportedStrictEqualityValueKinds();
testStrictEqualityMemberHelpers();
testStrictEqualityPrimitiveComparison();
testStrictEqualityNullableReferenceComparison();
testStrictEqualityStringComparison();
testStrictEqualityArrayBufferComparison();
testStrictEqualityRuntimeTypeHelpers();
testStrictEqualityReferencePairTracking();
testStrictEqualityManagedClassComparison();
