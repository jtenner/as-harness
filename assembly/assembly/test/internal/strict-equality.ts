import {
  __asHarnessAddReflectedValueKeyValuePair,
  __asHarnessStrictEqualsMember,
  ADD_REFLECTED_VALUE_KEY_VALUE_PAIRS_METHOD_NAME,
  ADD_REFLECTED_VALUE_KEY_VALUE_PAIR_HELPER_NAME,
  compareStrictEqualityNullableReference,
  compareStrictEqualityPrimitive,
  STRICT_EQUALS_METHOD_NAME,
  STRICT_EQUALS_MEMBER_HELPER_NAME,
  StrictEqualityResult,
  StrictEqualityValueKind,
  isDeferredStrictEqualityResult,
  isSupportedStrictEqualityValueKind,
  isTerminalStrictEqualityResult,
} from "../../internal/strict-equality";

class StrictEqualityReferenceBox {}

function testStrictEqualityHookNames(): void {
  assert(STRICT_EQUALS_METHOD_NAME == "__asHarnessStrictEquals");
  assert(
    ADD_REFLECTED_VALUE_KEY_VALUE_PAIRS_METHOD_NAME ==
      "__asHarnessAddReflectedValueKeyValuePairs",
  );
  assert(STRICT_EQUALS_MEMBER_HELPER_NAME == "__asHarnessStrictEqualsMember");
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
  assert(__asHarnessStrictEqualsMember(123, "field:value", 42));
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

testStrictEqualityHookNames();
testStrictEqualityResultHelpers();
testSupportedStrictEqualityValueKinds();
testStrictEqualityMemberHelpers();
testStrictEqualityPrimitiveComparison();
testStrictEqualityNullableReferenceComparison();
