import {
  ADD_REFLECTED_VALUE_KEY_VALUE_PAIRS_METHOD_NAME,
  STRICT_EQUALS_METHOD_NAME,
  StrictEqualityResult,
  StrictEqualityValueKind,
  isDeferredStrictEqualityResult,
  isSupportedStrictEqualityValueKind,
  isTerminalStrictEqualityResult,
} from "../../internal/strict-equality";

function testStrictEqualityHookNames(): void {
  assert(STRICT_EQUALS_METHOD_NAME == "__asHarnessStrictEquals");
  assert(
    ADD_REFLECTED_VALUE_KEY_VALUE_PAIRS_METHOD_NAME ==
      "__asHarnessAddReflectedValueKeyValuePairs",
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

testStrictEqualityHookNames();
testStrictEqualityResultHelpers();
testSupportedStrictEqualityValueKinds();
