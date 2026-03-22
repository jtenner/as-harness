import {
	createReflectedValue,
	ReflectedValue,
	ReflectedValueEntry,
	ReflectedValueKeyValuePair,
	ReflectedValueKind,
	resetReflectedValueTracking,
} from "./reflected-value";
import {
	compareStrictEqualityArrayBuffer,
	StrictEqualityResult,
} from "./strict-equality";

function reflectedArrayBufferEquals(
	actual: ArrayBuffer | null,
	expected: ArrayBuffer | null,
): bool {
	return (
		compareStrictEqualityArrayBuffer(actual, expected) ==
		StrictEqualityResult.Match
	);
}

function reflectedIntegerEquals(
	actual: ReflectedValue,
	expected: ReflectedValue,
): bool {
	if (actual.integerIsSigned == expected.integerIsSigned) {
		return actual.integerIsSigned
			? actual.signedIntegerValue == expected.signedIntegerValue
			: actual.unsignedIntegerValue == expected.unsignedIntegerValue;
	}

	if (actual.integerIsSigned) {
		return (
			actual.signedIntegerValue >= 0 &&
			<u64>actual.signedIntegerValue == expected.unsignedIntegerValue
		);
	}

	return (
		expected.signedIntegerValue >= 0 &&
		actual.unsignedIntegerValue == <u64>expected.signedIntegerValue
	);
}

function reflectedFloatEquals(
	actual: ReflectedValue,
	expected: ReflectedValue,
): bool {
	if (isNaN(actual.floatValue) || isNaN(expected.floatValue)) {
		return isNaN(actual.floatValue) && isNaN(expected.floatValue);
	}

	return actual.floatValue == expected.floatValue;
}

function reflectedStringMatches(
	actual: string | null,
	expected: string | null,
): bool {
	if (actual === null || expected === null) {
		return actual === expected;
	}

	return actual.includes(expected);
}

function findMatchingSetValueIndex(
	actualValues: Array<ReflectedValue>,
	expectedValue: ReflectedValue,
	usedIndexes: Array<bool>,
): i32 {
	for (let i = 0, length = actualValues.length; i < length; i++) {
		if (unchecked(usedIndexes[i])) {
			continue;
		}

		if (matchesReflectedPartial(unchecked(actualValues[i]), expectedValue)) {
			return i;
		}
	}

	return -1;
}

function findMatchingMapEntryIndex(
	actualEntries: Array<ReflectedValueEntry>,
	expectedEntry: ReflectedValueEntry,
	usedIndexes: Array<bool>,
): i32 {
	for (let i = 0, length = actualEntries.length; i < length; i++) {
		if (unchecked(usedIndexes[i])) {
			continue;
		}

		const actualEntry = unchecked(actualEntries[i]);
		if (
			matchesReflectedPartial(actualEntry.key, expectedEntry.key) &&
			matchesReflectedPartial(actualEntry.value, expectedEntry.value)
		) {
			return i;
		}
	}

	return -1;
}

function findReflectedKeyValuePair(
	keyValuePairs: Array<ReflectedValueKeyValuePair>,
	key: string,
): ReflectedValueKeyValuePair | null {
	for (let i = 0, length = keyValuePairs.length; i < length; i++) {
		const pair = unchecked(keyValuePairs[i]);
		if (pair.key == key) {
			return pair;
		}
	}

	return null;
}

function matchesReflectedArrayLike(
	actual: ReflectedValue,
	expected: ReflectedValue,
): bool {
	if (actual.values === null || expected.values === null) {
		return false;
	}

	const actualValues = changetype<Array<ReflectedValue>>(actual.values);
	const expectedValues = changetype<Array<ReflectedValue>>(expected.values);
	if (actualValues.length < expectedValues.length) {
		return false;
	}

	for (let i = 0, length = expectedValues.length; i < length; i++) {
		if (
			!matchesReflectedPartial(
				unchecked(actualValues[i]),
				unchecked(expectedValues[i]),
			)
		) {
			return false;
		}
	}

	return true;
}

function matchesReflectedSet(
	actual: ReflectedValue,
	expected: ReflectedValue,
): bool {
	if (actual.values === null || expected.values === null) {
		return false;
	}

	const actualValues = changetype<Array<ReflectedValue>>(actual.values);
	const expectedValues = changetype<Array<ReflectedValue>>(expected.values);
	if (actualValues.length < expectedValues.length) {
		return false;
	}

	const usedIndexes = new Array<bool>(actualValues.length);
	for (let i = 0, length = expectedValues.length; i < length; i++) {
		const matchIndex = findMatchingSetValueIndex(
			actualValues,
			unchecked(expectedValues[i]),
			usedIndexes,
		);
		if (matchIndex < 0) {
			return false;
		}

		unchecked((usedIndexes[matchIndex] = true));
	}

	return true;
}

function matchesReflectedMap(
	actual: ReflectedValue,
	expected: ReflectedValue,
): bool {
	if (actual.entries === null || expected.entries === null) {
		return false;
	}

	const actualEntries = changetype<Array<ReflectedValueEntry>>(actual.entries);
	const expectedEntries = changetype<Array<ReflectedValueEntry>>(
		expected.entries,
	);
	if (actualEntries.length < expectedEntries.length) {
		return false;
	}

	const usedIndexes = new Array<bool>(actualEntries.length);
	for (let i = 0, length = expectedEntries.length; i < length; i++) {
		const matchIndex = findMatchingMapEntryIndex(
			actualEntries,
			unchecked(expectedEntries[i]),
			usedIndexes,
		);
		if (matchIndex < 0) {
			return false;
		}

		unchecked((usedIndexes[matchIndex] = true));
	}

	return true;
}

function matchesReflectedManagedClass(
	actual: ReflectedValue,
	expected: ReflectedValue,
): bool {
	if (actual.keyValuePairs === null || expected.keyValuePairs === null) {
		return false;
	}

	if (
		actual.runtimeTypeId != 0 &&
		expected.runtimeTypeId != 0 &&
		actual.runtimeTypeId != expected.runtimeTypeId
	) {
		return false;
	}

	const actualPairs = changetype<Array<ReflectedValueKeyValuePair>>(
		actual.keyValuePairs,
	);
	const expectedPairs = changetype<Array<ReflectedValueKeyValuePair>>(
		expected.keyValuePairs,
	);

	for (let i = 0, length = expectedPairs.length; i < length; i++) {
		const expectedPair = unchecked(expectedPairs[i]);
		const actualPair = findReflectedKeyValuePair(actualPairs, expectedPair.key);
		if (actualPair === null) {
			return false;
		}

		if (!matchesReflectedPartial(actualPair.value, expectedPair.value)) {
			return false;
		}
	}

	return true;
}

export function matchesReflectedPartial(
	actual: ReflectedValue,
	expected: ReflectedValue,
): bool {
	switch (expected.kind) {
		case ReflectedValueKind.Null:
			return actual.kind == ReflectedValueKind.Null;
		case ReflectedValueKind.Boolean:
			return (
				actual.kind == ReflectedValueKind.Boolean &&
				actual.booleanValue == expected.booleanValue
			);
		case ReflectedValueKind.Integer:
			return (
				actual.kind == ReflectedValueKind.Integer &&
				reflectedIntegerEquals(actual, expected)
			);
		case ReflectedValueKind.Float:
			return (
				actual.kind == ReflectedValueKind.Float &&
				reflectedFloatEquals(actual, expected)
			);
		case ReflectedValueKind.String:
			return (
				actual.kind == ReflectedValueKind.String &&
				reflectedStringMatches(actual.stringValue, expected.stringValue)
			);
		case ReflectedValueKind.ArrayBuffer:
			return (
				actual.kind == ReflectedValueKind.ArrayBuffer &&
				reflectedArrayBufferEquals(actual.bytes, expected.bytes)
			);
		case ReflectedValueKind.ArrayLike:
			return (
				actual.kind == ReflectedValueKind.ArrayLike &&
				matchesReflectedArrayLike(actual, expected)
			);
		case ReflectedValueKind.ArrayBufferView:
			return (
				actual.kind == ReflectedValueKind.ArrayBufferView &&
				actual.runtimeTypeId == expected.runtimeTypeId &&
				reflectedArrayBufferEquals(actual.bytes, expected.bytes)
			);
		case ReflectedValueKind.Set:
			return (
				actual.kind == ReflectedValueKind.Set &&
				matchesReflectedSet(actual, expected)
			);
		case ReflectedValueKind.Map:
			return (
				actual.kind == ReflectedValueKind.Map &&
				matchesReflectedMap(actual, expected)
			);
		case ReflectedValueKind.ManagedClass:
			return (
				actual.kind == ReflectedValueKind.ManagedClass &&
				matchesReflectedManagedClass(actual, expected)
			);
		case ReflectedValueKind.CircularReference:
			return (
				actual.kind == ReflectedValueKind.CircularReference &&
				actual.runtimeTypeId == expected.runtimeTypeId
			);
		case ReflectedValueKind.Unsupported:
			return false;
		default:
			return false;
	}
}

export function isPartialMatch<Actual, Expected>(
	actual: Actual,
	expected: Expected,
): bool {
	resetReflectedValueTracking();
	const actualReflected = createReflectedValue(actual);
	resetReflectedValueTracking();
	const expectedReflected = createReflectedValue(expected);
	resetReflectedValueTracking();
	const matched = matchesReflectedPartial(actualReflected, expectedReflected);
	resetReflectedValueTracking();
	return matched;
}
