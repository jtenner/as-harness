import {
	createReflectedValue,
	ReflectedValue,
	ReflectedValueEntry,
	ReflectedValueKeyValuePair,
	ReflectedValueKind,
	resetReflectedValueTracking,
} from "./reflected-value";

function hexDigit(value: i32): string {
	return String.fromCharCode(value < 10 ? 48 + value : 87 + value);
}

function formatByteHex(value: u8): string {
	return "0x" + hexDigit((value >> 4) & 0x0f) + hexDigit(value & 0x0f);
}

function escapeQuotedString(value: string): string {
	let result = '"';
	for (let index = 0, length = value.length; index < length; index++) {
		const code = value.charCodeAt(index);
		if (code == 34) {
			result += '\\"';
			continue;
		}
		if (code == 92) {
			result += "\\\\";
			continue;
		}

		result += String.fromCharCode(code);
	}

	return result + '"';
}

function renderByteBuffer(bytes: ArrayBuffer | null): string {
	if (bytes === null) {
		return "[]";
	}

	const view = Uint8Array.wrap(bytes);
	let result = "[";
	for (let index = 0, length = view.length; index < length; index++) {
		if (index > 0) {
			result += ", ";
		}

		result += formatByteHex(unchecked(view[index]));
	}

	return result + "]";
}

function renderValues(values: Array<ReflectedValue> | null): string {
	if (values === null || values.length == 0) {
		return "";
	}

	let result = "";
	for (let index = 0, length = values.length; index < length; index++) {
		if (index > 0) {
			result += ", ";
		}

		result += renderReflectedValue(unchecked(values[index]));
	}

	return result;
}

function renderEntries(entries: Array<ReflectedValueEntry> | null): string {
	if (entries === null || entries.length == 0) {
		return "";
	}

	let result = "";
	for (let index = 0, length = entries.length; index < length; index++) {
		if (index > 0) {
			result += ", ";
		}

		const entry = unchecked(entries[index]);
		result +=
			renderReflectedValue(entry.key) +
			" => " +
			renderReflectedValue(entry.value);
	}

	return result;
}

function renderKeyValuePairs(
	keyValuePairs: Array<ReflectedValueKeyValuePair> | null,
): string {
	if (keyValuePairs === null || keyValuePairs.length == 0) {
		return "";
	}

	let result = "";
	for (let index = 0, length = keyValuePairs.length; index < length; index++) {
		if (index > 0) {
			result += ", ";
		}

		const pair = unchecked(keyValuePairs[index]);
		result += pair.key + ": " + renderReflectedValue(pair.value);
	}

	return result;
}

function renderFloatValue(value: f64): string {
	if (isNaN(value)) {
		return "NaN";
	}
	if (value == Infinity) {
		return "Infinity";
	}
	if (value == -Infinity) {
		return "-Infinity";
	}

	return value.toString();
}

export function renderReflectedValue(value: ReflectedValue): string {
	switch (value.kind) {
		case ReflectedValueKind.Null:
			return "null";
		case ReflectedValueKind.Boolean:
			return value.booleanValue ? "true" : "false";
		case ReflectedValueKind.Integer:
			return value.integerIsSigned
				? value.signedIntegerValue.toString()
				: value.unsignedIntegerValue.toString();
		case ReflectedValueKind.Float:
			return renderFloatValue(value.floatValue);
		case ReflectedValueKind.String:
			return escapeQuotedString(
				value.stringValue === null ? "" : changetype<string>(value.stringValue),
			);
		case ReflectedValueKind.ArrayBuffer:
			return "ArrayBuffer " + renderByteBuffer(value.bytes);
		case ReflectedValueKind.ArrayLike:
			return "[" + renderValues(value.values) + "]";
		case ReflectedValueKind.ArrayBufferView:
			return "ArrayBufferView " + renderByteBuffer(value.bytes);
		case ReflectedValueKind.Set:
			return "Set {" + renderValues(value.values) + "}";
		case ReflectedValueKind.Map:
			return "Map {" + renderEntries(value.entries) + "}";
		case ReflectedValueKind.ManagedClass:
			return "{" + renderKeyValuePairs(value.keyValuePairs) + "}";
		case ReflectedValueKind.CircularReference:
			return "[Circular]";
		case ReflectedValueKind.Unsupported:
			return "[Unsupported]";
		default:
			return "[Unsupported]";
	}
}

export function stringifyReflectedValue<T>(value: T): string {
	resetReflectedValueTracking();
	const rendered = renderReflectedValue(createReflectedValue(value));
	resetReflectedValueTracking();
	return rendered;
}
