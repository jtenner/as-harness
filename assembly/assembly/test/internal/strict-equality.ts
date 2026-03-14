import {
  __asHarnessAddReflectedValueKeyValuePair,
  __asHarnessHasStrictEqualityRuntimeType,
  __asHarnessStrictEqualsMember,
  ADD_REFLECTED_VALUE_KEY_VALUE_PAIRS_METHOD_NAME,
  ADD_REFLECTED_VALUE_KEY_VALUE_PAIR_HELPER_NAME,
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

testStrictEqualityHookNames();
testStrictEqualityResultHelpers();
testSupportedStrictEqualityValueKinds();
testStrictEqualityMemberHelpers();
testStrictEqualityPrimitiveComparison();
testStrictEqualityNullableReferenceComparison();
testStrictEqualityStringComparison();
testStrictEqualityRuntimeTypeHelpers();
testStrictEqualityReferencePairTracking();
