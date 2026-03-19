import {
	__asHarnessAddReflectedValueKeyValuePair,
	__asHarnessHasStrictEqualityRuntimeType,
	__asHarnessStrictEqualsArrayBufferMember,
	__asHarnessStrictEqualsArrayBufferViewMember,
	__asHarnessStrictEqualsMapMember,
	__asHarnessStrictEqualsSetMember,
	__asHarnessStrictEqualsManagedClassMember,
	__asHarnessStrictEqualsMember,
	ADD_REFLECTED_VALUE_KEY_VALUE_PAIRS_METHOD_NAME,
	ADD_REFLECTED_VALUE_KEY_VALUE_PAIR_HELPER_NAME,
	compareStrictEqualityArray,
	compareStrictEqualityArrayLike,
	compareStrictEqualityArrayBuffer,
	compareStrictEqualityArrayBufferView,
	compareStrictEqualityFunctionReference,
	compareStrictEqualityMap,
	compareStrictEqualitySet,
	compareStrictEqualityManagedClass,
	compareStrictEqualityReferencePair,
	compareStrictEqualityStaticArray,
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
	STRICT_EQUALS_ARRAY_BUFFER_VIEW_MEMBER_HELPER_NAME,
	STRICT_EQUALS_MAP_MEMBER_HELPER_NAME,
	STRICT_EQUALS_SET_MEMBER_HELPER_NAME,
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
function strictEqualityFunctionOne(): i32 {
	return 1;
}

function strictEqualityFunctionTwo(): i32 {
	return 2;
}

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
			__asHarnessStrictEqualsMember(
				"field:label",
				this.label,
				otherNode.label,
			) &&
			__asHarnessStrictEqualsManagedClassMember(
				"field:next",
				this.next,
				otherNode.next,
			)
		);
	}
}

@unmanaged
class StrictEqualityUnmanagedPlain {
	value: i32 = 0;
}

@unmanaged
class StrictEqualityUnmanagedOverride {
	value: i32 = 0;

	__asHarnessStrictEquals(other: usize): bool {
		if (other == changetype<usize>(this)) {
			return true;
		}

		if (other == 0) {
			return false;
		}

		const otherValue = changetype<StrictEqualityUnmanagedOverride>(other);
		return __asHarnessStrictEqualsMember(
			"field:value",
			this.value,
			otherValue.value,
		);
	}
}

@unmanaged
class StrictEqualityUnmanagedArrayLike {
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
		compareStrictEqualityReferencePair(
			left,
			right,
			returnMatchForStrictEqualityPair,
		) == StrictEqualityResult.Defer,
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
		STRICT_EQUALS_ARRAY_BUFFER_VIEW_MEMBER_HELPER_NAME ==
			"__asHarnessStrictEqualsArrayBufferViewMember",
	);
	assert(
		STRICT_EQUALS_SET_MEMBER_HELPER_NAME == "__asHarnessStrictEqualsSetMember",
	);
	assert(
		STRICT_EQUALS_MAP_MEMBER_HELPER_NAME == "__asHarnessStrictEqualsMapMember",
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
	assert(
		isSupportedStrictEqualityValueKind(StrictEqualityValueKind.ArrayBuffer),
	);
	assert(isSupportedStrictEqualityValueKind(StrictEqualityValueKind.ArrayLike));
	assert(
		isSupportedStrictEqualityValueKind(StrictEqualityValueKind.ArrayBufferView),
	);
	assert(isSupportedStrictEqualityValueKind(StrictEqualityValueKind.Set));
	assert(isSupportedStrictEqualityValueKind(StrictEqualityValueKind.Map));
	assert(
		isSupportedStrictEqualityValueKind(StrictEqualityValueKind.ManagedClass),
	);
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

function createIntArray(values: StaticArray<i32>): Array<i32> {
	const output = new Array<i32>(values.length);
	for (let i = 0; i < values.length; i++) {
		output[i] = unchecked(values[i]);
	}
	return output;
}

function createReferenceArray<T>(values: Array<T>): Array<T> {
	const output = new Array<T>(values.length);
	for (let i = 0; i < values.length; i++) {
		output[i] = unchecked(values[i]);
	}
	return output;
}

function createUint8Array(values: StaticArray<u8>): Uint8Array {
	const output = new Uint8Array(values.length);
	for (let i = 0; i < values.length; i++) {
		output[i] = unchecked(values[i]);
	}
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
		compareStrictEqualityPrimitive<f32>(NaN, NaN) == StrictEqualityResult.Match,
	);
	assert(
		compareStrictEqualityPrimitive<f32>(NaN, 1.0) == StrictEqualityResult.Fail,
	);
	assert(
		compareStrictEqualityPrimitive<f64>(NaN, NaN) == StrictEqualityResult.Match,
	);
	assert(
		compareStrictEqualityPrimitive<f64>(NaN, 1.0) == StrictEqualityResult.Fail,
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

function testStrictEqualityArrayComparison(): void {
	const left = createIntArray([1, 2, 3]);
	const right = createIntArray([1, 2, 3]);
	const mismatch = createIntArray([1, 9, 3]);
	const shorter = createIntArray([1, 2]);
	const nullArray = changetype<Array<i32> | null>(0);

	assert(compareStrictEqualityArray(left, right) == StrictEqualityResult.Match);
	assert(
		compareStrictEqualityArray(left, mismatch) == StrictEqualityResult.Fail,
	);
	assert(
		compareStrictEqualityArray(left, shorter) == StrictEqualityResult.Fail,
	);
	assert(
		compareStrictEqualityArray(nullArray, nullArray) ==
			StrictEqualityResult.Match,
	);
	assert(
		compareStrictEqualityArray(left, nullArray) == StrictEqualityResult.Fail,
	);
	assert(
		compareStrictEqualityValue<Array<i32>>(left, right) ==
			StrictEqualityResult.Match,
	);
	assert(
		compareStrictEqualityValue<Array<i32>>(left, mismatch) ==
			StrictEqualityResult.Fail,
	);

	const bufferLeft = [
		createArrayBufferFromBytes([1, 2]),
		createArrayBufferFromBytes([3]),
	];
	const bufferRight = [
		createArrayBufferFromBytes([1, 2]),
		createArrayBufferFromBytes([3]),
	];
	const bufferMismatch = [
		createArrayBufferFromBytes([1, 2]),
		createArrayBufferFromBytes([4]),
	];
	assert(
		compareStrictEqualityValue<Array<ArrayBuffer>>(bufferLeft, bufferRight) ==
			StrictEqualityResult.Match,
	);
	assert(
		compareStrictEqualityValue<Array<ArrayBuffer>>(
			bufferLeft,
			bufferMismatch,
		) == StrictEqualityResult.Fail,
	);

	const recursiveLeft = [createRecursiveCycle("root", "child")];
	const recursiveRight = [createRecursiveCycle("root", "child")];
	const recursiveMismatch = [createRecursiveCycle("root", "other")];

	resetStrictEqualityReferencePairTracking();
	assert(
		compareStrictEqualityValue<Array<StrictEqualityRecursiveNode>>(
			recursiveLeft,
			recursiveRight,
		) == StrictEqualityResult.Match,
	);
	assert(getActiveStrictEqualityReferencePairCount() == 0);
	assert(getProvenStrictEqualityReferencePairCount() == 3);

	resetStrictEqualityReferencePairTracking();
	assert(
		compareStrictEqualityValue<Array<StrictEqualityRecursiveNode>>(
			recursiveLeft,
			recursiveMismatch,
		) == StrictEqualityResult.Fail,
	);
	assert(getActiveStrictEqualityReferencePairCount() == 0);
	assert(getProvenStrictEqualityReferencePairCount() == 0);
}

function testStrictEqualityStaticArrayComparison(): void {
	const left: StaticArray<i32> = [1, 2, 3];
	const right: StaticArray<i32> = [1, 2, 3];
	const mismatch: StaticArray<i32> = [1, 9, 3];
	const shorter: StaticArray<i32> = [1, 2];
	const nullArray = changetype<StaticArray<i32> | null>(0);

	assert(
		compareStrictEqualityStaticArray(left, right) == StrictEqualityResult.Match,
	);
	assert(
		compareStrictEqualityStaticArray(left, mismatch) ==
			StrictEqualityResult.Fail,
	);
	assert(
		compareStrictEqualityStaticArray(left, shorter) ==
			StrictEqualityResult.Fail,
	);
	assert(
		compareStrictEqualityStaticArray(nullArray, nullArray) ==
			StrictEqualityResult.Match,
	);
	assert(
		compareStrictEqualityStaticArray(left, nullArray) ==
			StrictEqualityResult.Fail,
	);
	assert(
		compareStrictEqualityValue<StaticArray<i32>>(left, right) ==
			StrictEqualityResult.Match,
	);
	assert(
		compareStrictEqualityValue<StaticArray<i32>>(left, mismatch) ==
			StrictEqualityResult.Fail,
	);
}

function testStrictEqualityArrayBufferViewComparison(): void {
	const left = createUint8Array([1, 2, 3, 4]);
	const right = createUint8Array([1, 2, 3, 4]);
	const mismatch = createUint8Array([1, 2, 9, 4]);
	const shorter = createUint8Array([1, 2, 3]);
	const signed = new Int8Array(4);
	signed[0] = 1;
	signed[1] = 2;
	signed[2] = 3;
	signed[3] = 4;

	assert(
		compareStrictEqualityArrayBufferView(left, right) ==
			StrictEqualityResult.Match,
		"typed array views with identical bytes should match",
	);
	assert(
		compareStrictEqualityArrayBufferView(left, mismatch) ==
			StrictEqualityResult.Fail,
		"typed array views with different bytes should fail",
	);
	assert(
		compareStrictEqualityArrayBufferView(left, shorter) ==
			StrictEqualityResult.Fail,
		"typed array views with different lengths should fail",
	);
	assert(
		compareStrictEqualityArrayBufferView(
			changetype<ArrayBufferView>(left),
			changetype<ArrayBufferView>(signed),
		) == StrictEqualityResult.Fail,
		"typed array views with different runtime types should fail",
	);
	assert(
		__asHarnessStrictEqualsArrayBufferViewMember("field:view", left, right),
		"view member helper should accept equal typed-array members",
	);
	assert(
		!__asHarnessStrictEqualsArrayBufferViewMember("field:view", left, mismatch),
		"view member helper should reject mismatched typed-array members",
	);

	const viewBufferLeft = createArrayBufferFromBytes([1, 2, 3, 4]);
	const viewBufferRight = createArrayBufferFromBytes([1, 2, 3, 4]);
	const viewBufferMismatch = createArrayBufferFromBytes([1, 2, 9, 4]);
	const viewLeft = new DataView(viewBufferLeft, 1, 2);
	const viewRight = new DataView(viewBufferRight, 1, 2);
	const viewMismatch = new DataView(viewBufferMismatch, 1, 2);

	assert(
		compareStrictEqualityArrayBufferView(
			changetype<ArrayBufferView>(viewLeft),
			changetype<ArrayBufferView>(viewRight),
		) == StrictEqualityResult.Match,
		"DataView slices with identical bytes should match",
	);
	assert(
		compareStrictEqualityArrayBufferView(
			changetype<ArrayBufferView>(viewLeft),
			changetype<ArrayBufferView>(viewMismatch),
		) == StrictEqualityResult.Fail,
		"DataView slices with different bytes should fail",
	);
	assert(
		__asHarnessStrictEqualsArrayBufferViewMember(
			"field:view",
			viewLeft,
			viewRight,
		),
		"view member helper should accept equal DataView members",
	);
	assert(
		!__asHarnessStrictEqualsArrayBufferViewMember(
			"field:view",
			viewLeft,
			viewMismatch,
		),
		"view member helper should reject mismatched DataView members",
	);
	assert(
		compareStrictEqualityArrayBufferView(
			changetype<ArrayBufferView>(left),
			changetype<ArrayBufferView>(viewLeft),
		) == StrictEqualityResult.Fail,
		"typed arrays should not compare equal to DataView instances",
	);
}

function testStrictEqualitySetComparison(): void {
	const left = new Set<i32>();
	left.add(1);
	left.add(2);
	left.add(3);

	const right = new Set<i32>();
	right.add(1);
	right.add(2);
	right.add(3);

	const mismatch = new Set<i32>();
	mismatch.add(1);
	mismatch.add(9);
	mismatch.add(3);

	const reordered = new Set<i32>();
	reordered.add(3);
	reordered.add(2);
	reordered.add(1);

	const shorter = new Set<i32>();
	shorter.add(1);
	shorter.add(2);

	const nullSet = changetype<Set<i32> | null>(0);

	assert(compareStrictEqualitySet(left, right) == StrictEqualityResult.Match);
	assert(compareStrictEqualitySet(left, mismatch) == StrictEqualityResult.Fail);
	assert(
		compareStrictEqualitySet(left, reordered) == StrictEqualityResult.Fail,
	);
	assert(compareStrictEqualitySet(left, shorter) == StrictEqualityResult.Fail);
	assert(
		compareStrictEqualitySet(nullSet, nullSet) == StrictEqualityResult.Match,
	);
	assert(compareStrictEqualitySet(left, nullSet) == StrictEqualityResult.Fail);
	assert(__asHarnessStrictEqualsSetMember("field:set", left, right));
	assert(!__asHarnessStrictEqualsSetMember("field:set", left, mismatch));
	assert(!__asHarnessStrictEqualsSetMember("field:set", left, reordered));
	assert(
		compareStrictEqualityValue<Set<i32>>(left, right) ==
			StrictEqualityResult.Match,
	);
	assert(
		compareStrictEqualityValue<Set<i32>>(left, mismatch) ==
			StrictEqualityResult.Fail,
	);

	const nestedSetLeft = createReferenceArray<Set<i32>>([left, right]);
	const nestedSetRight = createReferenceArray<Set<i32>>([right, left]);
	const nestedSetMismatch = createReferenceArray<Set<i32>>([right, mismatch]);

	assert(
		compareStrictEqualityValue<Array<Set<i32>>>(
			nestedSetLeft,
			nestedSetRight,
		) == StrictEqualityResult.Match,
	);
	assert(
		compareStrictEqualityValue<Array<Set<i32>>>(
			nestedSetLeft,
			nestedSetMismatch,
		) == StrictEqualityResult.Fail,
	);

	const recursiveLeft = new Set<StrictEqualityRecursiveNode>();
	recursiveLeft.add(createRecursiveCycle("root", "child"));
	const recursiveRight = new Set<StrictEqualityRecursiveNode>();
	recursiveRight.add(createRecursiveCycle("root", "child"));
	const recursiveMismatch = new Set<StrictEqualityRecursiveNode>();
	recursiveMismatch.add(createRecursiveCycle("root", "other"));

	resetStrictEqualityReferencePairTracking();
	assert(
		compareStrictEqualitySet(recursiveLeft, recursiveRight) ==
			StrictEqualityResult.Match,
	);
	assert(
		__asHarnessStrictEqualsSetMember(
			"field:set",
			recursiveLeft,
			recursiveRight,
		),
	);
	assert(getActiveStrictEqualityReferencePairCount() == 0);
	assert(getProvenStrictEqualityReferencePairCount() == 3);

	resetStrictEqualityReferencePairTracking();
	assert(
		compareStrictEqualitySet(recursiveLeft, recursiveMismatch) ==
			StrictEqualityResult.Fail,
	);
	assert(getActiveStrictEqualityReferencePairCount() == 0);
	assert(getProvenStrictEqualityReferencePairCount() == 0);
}

function testStrictEqualityMapComparison(): void {
	const left = new Map<i32, string>();
	left.set(1, "one");
	left.set(2, "two");

	const right = new Map<i32, string>();
	right.set(1, "one");
	right.set(2, "two");

	const mismatchValue = new Map<i32, string>();
	mismatchValue.set(1, "one");
	mismatchValue.set(2, "other");

	const mismatchKey = new Map<i32, string>();
	mismatchKey.set(1, "one");
	mismatchKey.set(9, "two");

	const reordered = new Map<i32, string>();
	reordered.set(2, "two");
	reordered.set(1, "one");

	const shorter = new Map<i32, string>();
	shorter.set(1, "one");

	const nullMap = changetype<Map<i32, string> | null>(0);

	assert(compareStrictEqualityMap(left, right) == StrictEqualityResult.Match);
	assert(
		compareStrictEqualityMap(left, mismatchValue) == StrictEqualityResult.Fail,
	);
	assert(
		compareStrictEqualityMap(left, mismatchKey) == StrictEqualityResult.Fail,
	);
	assert(
		compareStrictEqualityMap(left, reordered) == StrictEqualityResult.Fail,
	);
	assert(compareStrictEqualityMap(left, shorter) == StrictEqualityResult.Fail);
	assert(
		compareStrictEqualityMap(nullMap, nullMap) == StrictEqualityResult.Match,
	);
	assert(compareStrictEqualityMap(left, nullMap) == StrictEqualityResult.Fail);
	assert(__asHarnessStrictEqualsMapMember("field:map", left, right));
	assert(!__asHarnessStrictEqualsMapMember("field:map", left, mismatchValue));
	assert(!__asHarnessStrictEqualsMapMember("field:map", left, mismatchKey));
	assert(!__asHarnessStrictEqualsMapMember("field:map", left, reordered));
	assert(
		compareStrictEqualityValue<Map<i32, string>>(left, right) ==
			StrictEqualityResult.Match,
	);
	assert(
		compareStrictEqualityValue<Map<i32, string>>(left, mismatchValue) ==
			StrictEqualityResult.Fail,
	);

	const nestedMapLeft = createReferenceArray<Map<i32, string>>([left, right]);
	const nestedMapRight = createReferenceArray<Map<i32, string>>([right, left]);
	const nestedMapMismatch = createReferenceArray<Map<i32, string>>([
		right,
		mismatchValue,
	]);

	assert(
		compareStrictEqualityValue<Array<Map<i32, string>>>(
			nestedMapLeft,
			nestedMapRight,
		) == StrictEqualityResult.Match,
	);
	assert(
		compareStrictEqualityValue<Array<Map<i32, string>>>(
			nestedMapLeft,
			nestedMapMismatch,
		) == StrictEqualityResult.Fail,
	);

	const recursiveLeft = new Map<string, StrictEqualityRecursiveNode>();
	recursiveLeft.set("root", createRecursiveCycle("root", "child"));
	const recursiveRight = new Map<string, StrictEqualityRecursiveNode>();
	recursiveRight.set("root", createRecursiveCycle("root", "child"));
	const recursiveMismatch = new Map<string, StrictEqualityRecursiveNode>();
	recursiveMismatch.set("root", createRecursiveCycle("root", "other"));

	resetStrictEqualityReferencePairTracking();
	assert(
		compareStrictEqualityMap(recursiveLeft, recursiveRight) ==
			StrictEqualityResult.Match,
	);
	assert(
		__asHarnessStrictEqualsMapMember(
			"field:map",
			recursiveLeft,
			recursiveRight,
		),
	);
	assert(getActiveStrictEqualityReferencePairCount() == 0);
	assert(getProvenStrictEqualityReferencePairCount() == 3);

	resetStrictEqualityReferencePairTracking();
	assert(
		compareStrictEqualityMap(recursiveLeft, recursiveMismatch) ==
			StrictEqualityResult.Fail,
	);
	assert(getActiveStrictEqualityReferencePairCount() == 0);
	assert(getProvenStrictEqualityReferencePairCount() == 0);
}

function testStrictEqualityFunctionReferenceComparison(): void {
	const one = strictEqualityFunctionOne;
	const same = strictEqualityFunctionOne;
	const two = strictEqualityFunctionTwo;
	const nullFunction = changetype<(() => i32) | null>(0);

	assert(
		compareStrictEqualityFunctionReference<() => i32>(one, same) ==
			StrictEqualityResult.Match,
	);
	assert(
		compareStrictEqualityFunctionReference<() => i32>(one, two) ==
			StrictEqualityResult.Fail,
	);
	assert(
		compareStrictEqualityFunctionReference<(() => i32) | null>(
			nullFunction,
			nullFunction,
		) == StrictEqualityResult.Match,
	);
	assert(
		compareStrictEqualityFunctionReference<(() => i32) | null>(
			one,
			nullFunction,
		) == StrictEqualityResult.Fail,
	);
	assert(
		compareStrictEqualityValue<() => i32>(one, same) ==
			StrictEqualityResult.Match,
	);
	assert(
		compareStrictEqualityValue<() => i32>(one, two) ==
			StrictEqualityResult.Fail,
	);
	assert(__asHarnessStrictEqualsMember("field:fn", one, same));
	assert(!__asHarnessStrictEqualsMember("field:fn", one, two));
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
		compareStrictEqualityReferencePair(
			leftRef,
			leftRef,
			returnFailForStrictEqualityPair,
		) == StrictEqualityResult.Match,
	);
	assert(strictEqualityCallbackRuns == 0);

	assert(
		compareStrictEqualityReferencePair(
			leftRef,
			0,
			returnMatchForStrictEqualityPair,
		) == StrictEqualityResult.Fail,
	);
	assert(strictEqualityCallbackRuns == 0);

	assert(
		compareStrictEqualityReferencePair(
			leftRef,
			rightRef,
			reenterStrictEqualityPair,
		) == StrictEqualityResult.Match,
	);
	assert(strictEqualityCallbackRuns == 1);
	assert(getActiveStrictEqualityReferencePairCount() == 0);
	assert(getProvenStrictEqualityReferencePairCount() == 1);
	assert(hasProvenStrictEqualityReferencePair(leftRef, rightRef));

	strictEqualityCallbackRuns = 0;
	assert(
		compareStrictEqualityReferencePair(
			leftRef,
			rightRef,
			returnFailForStrictEqualityPair,
		) == StrictEqualityResult.Match,
	);
	assert(strictEqualityCallbackRuns == 0);

	resetStrictEqualityReferencePairTracking();
	strictEqualityCallbackRuns = 0;
	assert(
		compareStrictEqualityReferencePair(
			leftRef,
			rightRef,
			returnFailForStrictEqualityPair,
		) == StrictEqualityResult.Fail,
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
		compareStrictEqualityManagedClass(left, right) ==
			StrictEqualityResult.Match,
	);
	assert(getActiveStrictEqualityReferencePairCount() == 0);
	assert(getProvenStrictEqualityReferencePairCount() == 2);

	resetStrictEqualityReferencePairTracking();
	assert(__asHarnessStrictEqualsManagedClassMember("field:next", left, right));
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
	assert(__asHarnessStrictEqualsManagedClassMember("field:next", left, left));
	assert(getActiveStrictEqualityReferencePairCount() == 0);
	assert(getProvenStrictEqualityReferencePairCount() == 0);

	resetStrictEqualityReferencePairTracking();
	assert(
		!__asHarnessStrictEqualsManagedClassMember("field:next", left, nullNode),
	);
	assert(getActiveStrictEqualityReferencePairCount() == 0);
}

function testStrictEqualityUnmanagedReferencePolicy(): void {
	const plainLeft = new StrictEqualityUnmanagedPlain();
	plainLeft.value = 7;
	const plainRight = new StrictEqualityUnmanagedPlain();
	plainRight.value = 7;

	assert(
		compareStrictEqualityValue<StrictEqualityUnmanagedPlain>(
			plainLeft,
			plainLeft,
		) == StrictEqualityResult.Match,
	);
	assert(
		compareStrictEqualityValue<StrictEqualityUnmanagedPlain>(
			plainLeft,
			plainRight,
		) == StrictEqualityResult.Fail,
	);

	const overrideLeft = new StrictEqualityUnmanagedOverride();
	overrideLeft.value = 11;
	const overrideRight = new StrictEqualityUnmanagedOverride();
	overrideRight.value = 11;
	const overrideMismatch = new StrictEqualityUnmanagedOverride();
	overrideMismatch.value = 12;

	resetStrictEqualityReferencePairTracking();
	assert(
		compareStrictEqualityValue<StrictEqualityUnmanagedOverride>(
			overrideLeft,
			overrideRight,
		) == StrictEqualityResult.Match,
	);
	assert(getActiveStrictEqualityReferencePairCount() == 0);
	assert(getProvenStrictEqualityReferencePairCount() == 1);

	resetStrictEqualityReferencePairTracking();
	assert(
		compareStrictEqualityValue<StrictEqualityUnmanagedOverride>(
			overrideLeft,
			overrideMismatch,
		) == StrictEqualityResult.Fail,
	);
	assert(getActiveStrictEqualityReferencePairCount() == 0);
	assert(getProvenStrictEqualityReferencePairCount() == 0);

	assert(
		__asHarnessStrictEqualsMember("field:value", overrideLeft, overrideRight),
	);
	assert(
		!__asHarnessStrictEqualsMember(
			"field:value",
			overrideLeft,
			overrideMismatch,
		),
	);

	const arrayLikeLeft = new StrictEqualityUnmanagedArrayLike();
	arrayLikeLeft.first = 1;
	arrayLikeLeft.second = 2;
	const arrayLikeRight = new StrictEqualityUnmanagedArrayLike();
	arrayLikeRight.first = 1;
	arrayLikeRight.second = 2;
	const arrayLikeMismatch = new StrictEqualityUnmanagedArrayLike();
	arrayLikeMismatch.first = 1;
	arrayLikeMismatch.second = 9;

	resetStrictEqualityReferencePairTracking();
	assert(
		compareStrictEqualityArrayLike<StrictEqualityUnmanagedArrayLike>(
			arrayLikeLeft,
			arrayLikeRight,
		) == StrictEqualityResult.Match,
	);
	assert(
		compareStrictEqualityValue<StrictEqualityUnmanagedArrayLike>(
			arrayLikeLeft,
			arrayLikeRight,
		) == StrictEqualityResult.Match,
	);
	assert(
		compareStrictEqualityValue<StrictEqualityUnmanagedArrayLike>(
			arrayLikeLeft,
			arrayLikeMismatch,
		) == StrictEqualityResult.Fail,
	);
}

testStrictEqualityHookNames();
testStrictEqualityResultHelpers();
testSupportedStrictEqualityValueKinds();
testStrictEqualityMemberHelpers();
testStrictEqualityPrimitiveComparison();
testStrictEqualityNullableReferenceComparison();
testStrictEqualityStringComparison();
testStrictEqualityArrayBufferComparison();
testStrictEqualityArrayComparison();
testStrictEqualityStaticArrayComparison();
testStrictEqualityArrayBufferViewComparison();
testStrictEqualitySetComparison();
testStrictEqualityMapComparison();
testStrictEqualityFunctionReferenceComparison();
testStrictEqualityRuntimeTypeHelpers();
testStrictEqualityReferencePairTracking();
testStrictEqualityManagedClassComparison();
testStrictEqualityUnmanagedReferencePolicy();
