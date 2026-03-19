import { memory } from "memory";
import { OBJECT, TOTAL_OVERHEAD } from "rt/common";

export const enum ReflectedValueKind {
	Null = 1,
	Boolean = 2,
	Integer = 3,
	Float = 4,
	String = 5,
	ArrayBuffer = 6,
	ArrayLike = 7,
	ArrayBufferView = 8,
	Set = 9,
	Map = 10,
	ManagedClass = 11,
	CircularReference = 12,
	Unsupported = 13,
}

export class ReflectedValueKeyValuePair {
	key: string;
	value: ReflectedValue;

	constructor(key: string, value: ReflectedValue) {
		this.key = key;
		this.value = value;
	}
}

export class ReflectedValueEntry {
	key: ReflectedValue;
	value: ReflectedValue;

	constructor(key: ReflectedValue, value: ReflectedValue) {
		this.key = key;
		this.value = value;
	}
}

export class ReflectedValue {
	kind: ReflectedValueKind;
	booleanValue: bool = false;
	signedIntegerValue: i64 = 0;
	unsignedIntegerValue: u64 = 0;
	integerIsSigned: bool = false;
	floatValue: f64 = 0.0;
	stringValue: string | null = null;
	byteLength: i32 = 0;
	bytes: ArrayBuffer | null = null;
	runtimeTypeId: u32 = 0;
	values: Array<ReflectedValue> | null = null;
	entries: Array<ReflectedValueEntry> | null = null;
	keyValuePairs: Array<ReflectedValueKeyValuePair> | null = null;

	constructor(kind: ReflectedValueKind) {
		this.kind = kind;
	}
}

const activeReflectedValueKeyValuePairCollections = new Array<
	Array<ReflectedValueKeyValuePair>
>();
const activeReflectedValueReferences = new Array<usize>();

function cloneArrayBuffer(value: ArrayBuffer): ArrayBuffer {
	const byteLength = value.byteLength;
	const clone = new ArrayBuffer(byteLength);

	if (byteLength > 0) {
		memory.copy(
			changetype<usize>(clone),
			changetype<usize>(value),
			<usize>byteLength,
		);
	}

	return clone;
}

function pushActiveReflectedValueKeyValuePairCollection(
	keyValuePairs: Array<ReflectedValueKeyValuePair>,
): void {
	activeReflectedValueKeyValuePairCollections.push(keyValuePairs);
}

function popActiveReflectedValueKeyValuePairCollection(): void {
	activeReflectedValueKeyValuePairCollections.pop();
}

function currentReflectedValueKeyValuePairCollection(): Array<ReflectedValueKeyValuePair> | null {
	const depth = activeReflectedValueKeyValuePairCollections.length;
	return depth > 0
		? unchecked(activeReflectedValueKeyValuePairCollections[depth - 1])
		: null;
}

function findActiveReflectedValueReferenceIndex(reference: usize): i32 {
	for (
		let i = 0, length = activeReflectedValueReferences.length;
		i < length;
		i++
	) {
		if (unchecked(activeReflectedValueReferences[i]) == reference) {
			return i;
		}
	}

	return -1;
}

function pushActiveReflectedValueReference(reference: usize): void {
	activeReflectedValueReferences.push(reference);
}

function popActiveReflectedValueReference(): void {
	activeReflectedValueReferences.pop();
}

function cloneArrayBufferViewBytes(value: ArrayBufferView): ArrayBuffer {
	const byteLength = value.byteLength;
	const clone = new ArrayBuffer(byteLength);

	if (byteLength > 0) {
		memory.copy(changetype<usize>(clone), value.dataStart, <usize>byteLength);
	}

	return clone;
}

export function isSupportedReflectedValueKind(kind: ReflectedValueKind): bool {
	return (
		kind == ReflectedValueKind.Null ||
		kind == ReflectedValueKind.Boolean ||
		kind == ReflectedValueKind.Integer ||
		kind == ReflectedValueKind.Float ||
		kind == ReflectedValueKind.String ||
		kind == ReflectedValueKind.ArrayBuffer ||
		kind == ReflectedValueKind.ArrayLike ||
		kind == ReflectedValueKind.ArrayBufferView ||
		kind == ReflectedValueKind.Set ||
		kind == ReflectedValueKind.Map ||
		kind == ReflectedValueKind.ManagedClass ||
		kind == ReflectedValueKind.CircularReference ||
		kind == ReflectedValueKind.Unsupported
	);
}

export function resetReflectedValueTracking(): void {
	activeReflectedValueKeyValuePairCollections.length = 0;
	activeReflectedValueReferences.length = 0;
}

export function getActiveReflectedValueKeyValuePairCollectionDepth(): i32 {
	return activeReflectedValueKeyValuePairCollections.length;
}

export function getActiveReflectedValueReferenceCount(): i32 {
	return activeReflectedValueReferences.length;
}

export function hasActiveReflectedValueReference(reference: usize): bool {
	return findActiveReflectedValueReferenceIndex(reference) >= 0;
}

export function getReflectedValueRuntimeTypeId(reference: usize): u32 {
	if (reference == 0) {
		return 0;
	}

	return changetype<OBJECT>(reference - TOTAL_OVERHEAD).rtId;
}

export function createNullReflectedValue(): ReflectedValue {
	return new ReflectedValue(ReflectedValueKind.Null);
}

export function createBooleanReflectedValue(value: bool): ReflectedValue {
	const reflected = new ReflectedValue(ReflectedValueKind.Boolean);
	reflected.booleanValue = value;
	return reflected;
}

export function createIntegerReflectedValue<T>(value: T): ReflectedValue {
	const reflected = new ReflectedValue(ReflectedValueKind.Integer);
	reflected.integerIsSigned = isSigned<T>();

	if (reflected.integerIsSigned) {
		reflected.signedIntegerValue = <i64>value;
	} else {
		reflected.unsignedIntegerValue = <u64>value;
	}

	return reflected;
}

export function createFloatReflectedValue<T>(value: T): ReflectedValue {
	const reflected = new ReflectedValue(ReflectedValueKind.Float);
	reflected.floatValue =
		sizeof<T>() == sizeof<f32>() ? <f64>(<f32>value) : <f64>value;
	return reflected;
}

export function createStringReflectedValue(
	value: string | null,
): ReflectedValue {
	if (value === null) {
		return createNullReflectedValue();
	}

	const reflected = new ReflectedValue(ReflectedValueKind.String);
	reflected.stringValue = value;
	return reflected;
}

export function createArrayBufferReflectedValue(
	value: ArrayBuffer | null,
): ReflectedValue {
	if (value === null) {
		return createNullReflectedValue();
	}

	const reflected = new ReflectedValue(ReflectedValueKind.ArrayBuffer);
	reflected.byteLength = value.byteLength;
	reflected.bytes = cloneArrayBuffer(value);
	return reflected;
}

export function createArrayReflectedValue<T>(
	value: Array<T> | null,
): ReflectedValue {
	if (value === null) {
		return createNullReflectedValue();
	}

	const reference = changetype<usize>(value);
	if (hasActiveReflectedValueReference(reference)) {
		return createCircularReferenceReflectedValue(reference);
	}

	pushActiveReflectedValueReference(reference);
	const reflected = new ReflectedValue(ReflectedValueKind.ArrayLike);
	reflected.runtimeTypeId = getReflectedValueRuntimeTypeId(reference);
	const values = new Array<ReflectedValue>();
	reflected.values = values;

	for (let i = 0, length = value.length; i < length; i++) {
		values.push(createReflectedValue<T>(value[i]));
	}

	popActiveReflectedValueReference();
	return reflected;
}

export function createStaticArrayReflectedValue<T>(
	value: StaticArray<T> | null,
): ReflectedValue {
	if (value === null) {
		return createNullReflectedValue();
	}

	const reference = changetype<usize>(value);
	if (hasActiveReflectedValueReference(reference)) {
		return createCircularReferenceReflectedValue(reference);
	}

	pushActiveReflectedValueReference(reference);
	const reflected = new ReflectedValue(ReflectedValueKind.ArrayLike);
	reflected.runtimeTypeId = getReflectedValueRuntimeTypeId(reference);
	const values = new Array<ReflectedValue>();
	reflected.values = values;

	for (let i = 0, length = value.length; i < length; i++) {
		values.push(createReflectedValue<T>(unchecked(value[i])));
	}

	popActiveReflectedValueReference();
	return reflected;
}

export function createArrayLikeReflectedValue<T>(value: T): ReflectedValue {
	const reference = changetype<usize>(value);

	if (reference == 0) {
		return createNullReflectedValue();
	}

	if (hasActiveReflectedValueReference(reference)) {
		return createCircularReferenceReflectedValue(reference);
	}

	pushActiveReflectedValueReference(reference);
	const reflected = new ReflectedValue(ReflectedValueKind.ArrayLike);
	reflected.runtimeTypeId = isManaged<T>()
		? getReflectedValueRuntimeTypeId(reference)
		: 0;
	const values = new Array<ReflectedValue>();
	reflected.values = values;

	// @ts-ignore `isArrayLike<T>()` guarantees `length` and index access.
	for (let i = 0, length = value.length; i < length; i++) {
		values.push(
			createReflectedValue<valueof<T>>(
				// @ts-ignore `isArrayLike<T>()` guarantees indexed access.
				unchecked(value[i]),
			),
		);
	}

	popActiveReflectedValueReference();
	return reflected;
}

export function createArrayBufferViewReflectedValue(
	value: ArrayBufferView | null,
): ReflectedValue {
	if (value === null) {
		return createNullReflectedValue();
	}

	const reflected = new ReflectedValue(ReflectedValueKind.ArrayBufferView);
	reflected.runtimeTypeId = getReflectedValueRuntimeTypeId(
		changetype<usize>(value),
	);
	reflected.byteLength = value.byteLength;
	reflected.bytes = cloneArrayBufferViewBytes(value);
	return reflected;
}

export function createSetReflectedValue<T>(
	value: Set<T> | null,
): ReflectedValue {
	if (value === null) {
		return createNullReflectedValue();
	}

	const reference = changetype<usize>(value);
	if (hasActiveReflectedValueReference(reference)) {
		return createCircularReferenceReflectedValue(reference);
	}

	pushActiveReflectedValueReference(reference);
	const reflected = new ReflectedValue(ReflectedValueKind.Set);
	reflected.runtimeTypeId = getReflectedValueRuntimeTypeId(reference);
	const values = new Array<ReflectedValue>();
	reflected.values = values;

	const setValues = value.values();
	for (let i = 0, length = setValues.length; i < length; i++) {
		values.push(createReflectedValue<T>(setValues[i]));
	}

	popActiveReflectedValueReference();
	return reflected;
}

export function createMapReflectedValue<K, V>(
	value: Map<K, V> | null,
): ReflectedValue {
	if (value === null) {
		return createNullReflectedValue();
	}

	const reference = changetype<usize>(value);
	if (hasActiveReflectedValueReference(reference)) {
		return createCircularReferenceReflectedValue(reference);
	}

	pushActiveReflectedValueReference(reference);
	const reflected = new ReflectedValue(ReflectedValueKind.Map);
	reflected.runtimeTypeId = getReflectedValueRuntimeTypeId(reference);
	const entries = new Array<ReflectedValueEntry>();
	reflected.entries = entries;

	const keys = value.keys();
	const values = value.values();
	for (let i = 0, length = keys.length; i < length; i++) {
		entries.push(
			new ReflectedValueEntry(
				createReflectedValue<K>(keys[i]),
				createReflectedValue<V>(values[i]),
			),
		);
	}

	popActiveReflectedValueReference();
	return reflected;
}

export function createCircularReferenceReflectedValue(
	reference: usize,
): ReflectedValue {
	const reflected = new ReflectedValue(ReflectedValueKind.CircularReference);
	reflected.runtimeTypeId = getReflectedValueRuntimeTypeId(reference);
	return reflected;
}

export function createUnsupportedReflectedValue(
	reference: usize = 0,
	isManagedReference: bool = true,
): ReflectedValue {
	const reflected = new ReflectedValue(ReflectedValueKind.Unsupported);
	reflected.runtimeTypeId = isManagedReference
		? getReflectedValueRuntimeTypeId(reference)
		: 0;
	return reflected;
}

export function createClassReflectedValue<T>(value: T): ReflectedValue {
	const reference = changetype<usize>(value);

	if (reference == 0) {
		return createNullReflectedValue();
	}

	if (hasActiveReflectedValueReference(reference)) {
		return createCircularReferenceReflectedValue(reference);
	}

	pushActiveReflectedValueReference(reference);
	beginReflectedValueKeyValuePairCollection();
	let invokedHook = false;
	// @ts-ignore The hook may be supplied either by the transform or explicitly
	// by consumer-defined types.
	if (
		isDefined(
			changetype<nonnull<T>>(reference)
				.__asHarnessAddReflectedValueKeyValuePairs,
		)
	) {
		// @ts-ignore The hook may be supplied either by the transform or explicitly
		// by consumer-defined types.
		changetype<nonnull<T>>(
			reference,
		).__asHarnessAddReflectedValueKeyValuePairs();
		invokedHook = true;
	}

	const keyValuePairs = finishReflectedValueKeyValuePairCollection();
	if (!invokedHook) {
		popActiveReflectedValueReference();
		return createUnsupportedReflectedValue(reference, isManaged<T>());
	}

	const reflected = new ReflectedValue(ReflectedValueKind.ManagedClass);
	reflected.runtimeTypeId = isManaged<T>()
		? getReflectedValueRuntimeTypeId(reference)
		: 0;
	reflected.keyValuePairs =
		keyValuePairs !== null
			? keyValuePairs
			: new Array<ReflectedValueKeyValuePair>();

	popActiveReflectedValueReference();
	return reflected;
}

export function beginReflectedValueKeyValuePairCollection(): void {
	pushActiveReflectedValueKeyValuePairCollection(
		new Array<ReflectedValueKeyValuePair>(),
	);
}

export function finishReflectedValueKeyValuePairCollection(): Array<ReflectedValueKeyValuePair> | null {
	const keyValuePairs = currentReflectedValueKeyValuePairCollection();

	if (keyValuePairs === null) {
		return null;
	}

	popActiveReflectedValueKeyValuePairCollection();
	return keyValuePairs;
}

export function createReflectedValue<T>(value: T): ReflectedValue {
	if (isReference<T>()) {
		const reference = changetype<usize>(value);

		if (reference == 0) {
			return createNullReflectedValue();
		}

		if (isString<T>()) {
			return createStringReflectedValue(changetype<string | null>(value));
		}

		if (isManaged<T>()) {
			if (idof<T>() == idof<ArrayBuffer>()) {
				return createArrayBufferReflectedValue(
					changetype<ArrayBuffer | null>(value),
				);
			}
		}

		if (isArray<T>()) {
			return createArrayReflectedValue<valueof<T>>(
				changetype<Array<valueof<T>> | null>(value),
			);
		}

		if (value instanceof StaticArray) {
			return createStaticArrayReflectedValue<valueof<T>>(
				changetype<StaticArray<valueof<T>> | null>(value),
			);
		}

		if (ArrayBuffer.isView(value)) {
			return createArrayBufferViewReflectedValue(
				changetype<ArrayBufferView | null>(value),
			);
		}

		if (isArrayLike<T>()) {
			return createArrayLikeReflectedValue<T>(value);
		}

		if (value instanceof Set) {
			return createSetReflectedValue<indexof<T>>(
				changetype<Set<indexof<T>> | null>(value),
			);
		}

		if (value instanceof Map) {
			return createMapReflectedValue<indexof<T>, valueof<T>>(
				changetype<Map<indexof<T>, valueof<T>> | null>(value),
			);
		}

		if (isFunction<T>()) {
			return createUnsupportedReflectedValue(reference, isManaged<T>());
		}

		return createClassReflectedValue(value);
	}

	if (isBoolean<T>()) {
		return createBooleanReflectedValue(<bool>value);
	}

	if (isInteger<T>()) {
		return createIntegerReflectedValue(value);
	}

	if (isFloat<T>()) {
		return createFloatReflectedValue(value);
	}

	return createUnsupportedReflectedValue();
}

export function addReflectedValueKeyValuePair<T>(
	memberHash: string,
	value: T,
): void {
	const keyValuePairs = currentReflectedValueKeyValuePairCollection();

	if (keyValuePairs === null) {
		return;
	}

	keyValuePairs.push(
		new ReflectedValueKeyValuePair(memberHash, createReflectedValue(value)),
	);
}
