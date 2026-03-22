import { createReflectedValue, ReflectedValueKind } from "./reflected-value";

export function runtimeTypeIdForValue<T>(value: T): u32 {
	if (isReference<T>() && changetype<usize>(value) == 0) {
		return 0;
	}

	const reflected = createReflectedValue(value);
	switch (reflected.kind) {
		case ReflectedValueKind.String:
			return idof<string>();
		case ReflectedValueKind.ArrayBuffer:
			return idof<ArrayBuffer>();
		default:
			return reflected.runtimeTypeId;
	}
}

export function isRuntimeTypeInstance<T>(
	value: T,
	expectedRuntimeTypeId: u32,
): bool {
	return (
		expectedRuntimeTypeId != 0 &&
		runtimeTypeIdForValue(value) == expectedRuntimeTypeId
	);
}
