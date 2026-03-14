import { isDeepStrictlyEqual } from "../../internal/assert-bridge";
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

testIsDeepStrictlyEqualMatchesEqualValues();
testIsDeepStrictlyEqualRejectsDifferentValues();
testIsDeepStrictlyEqualResetsStrictEqualityTracking();
