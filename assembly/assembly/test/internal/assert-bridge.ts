import {
  assertTruthy,
  isDeepStrictlyEqual,
  isStrictlyEqual,
} from "../../internal/assert-bridge";
import {
  getActiveStrictEqualityReferencePairCount,
  getProvenStrictEqualityReferencePairCount,
} from "../../internal/strict-equality";

function testIsDeepStrictlyEqualMatchesEqualValues(): void {
  assert(isDeepStrictlyEqual(7, 7));
  assert(isDeepStrictlyEqual("alpha", "alpha"));
}

function testIsDeepStrictlyEqualRejectsDifferentValues(): void {
  assert(!isDeepStrictlyEqual(7, 8));
  assert(!isDeepStrictlyEqual("alpha", "beta"));
}

function testIsDeepStrictlyEqualResetsStrictEqualityTracking(): void {
  const left = [1, 2, 3];
  const right = [1, 2, 3];
  const mismatch = [1, 2, 4];

  assert(isDeepStrictlyEqual(left, right));
  assert(!isDeepStrictlyEqual(left, mismatch));
  assert(getActiveStrictEqualityReferencePairCount() == 0);
  assert(getProvenStrictEqualityReferencePairCount() == 0);
}

function testIsStrictlyEqualMatchesPrimitiveObjectIsSemantics(): void {
  assert(isStrictlyEqual(7, 7));
  assert(!isStrictlyEqual(7, 8));
  assert(isStrictlyEqual<f64>(NaN, NaN));
}

function testIsStrictlyEqualUsesValueSemanticsForStringsAndIdentityForReferences(): void {
  const leftText = "alpha";
  const rightText = "alpha";
  const sharedNumbers = [1, 2, 3];
  const otherNumbers = [1, 2, 3];

  assert(isStrictlyEqual(leftText, rightText));
  assert(isStrictlyEqual(sharedNumbers, sharedNumbers));
  assert(!isStrictlyEqual(sharedNumbers, otherNumbers));
}

function testAssertTruthyAcceptsCommonTruthyValues(): void {
  assertTruthy(true);
  assertTruthy(1);
  assertTruthy("alpha");
  assertTruthy([1, 2, 3]);
}

testIsDeepStrictlyEqualMatchesEqualValues();
testIsDeepStrictlyEqualRejectsDifferentValues();
testIsDeepStrictlyEqualResetsStrictEqualityTracking();
testIsStrictlyEqualMatchesPrimitiveObjectIsSemantics();
testIsStrictlyEqualUsesValueSemanticsForStringsAndIdentityForReferences();
testAssertTruthyAcceptsCommonTruthyValues();
