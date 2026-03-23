import {
	assertCondition,
	assertDeepStrictEqual,
	assertDoesNotThrow,
	assertNotDeepStrictEqual,
	assertNotStrictEqual,
	assertStrictEqual,
	assertThrows,
	assertTruthy,
	isPartialMatch,
} from "../internal/assert-bridge";
import { TestContext as InternalTestContext } from "../internal/context";
import {
	getActiveExecutionTargetName,
	recordAssertionCall,
} from "../internal/execution-state";
import { diagnostic as emitDiagnostic } from "../internal/events";
import { currentNode } from "../internal/node";

function isTruthyValue<T>(value: T): bool {
	if (isReference<T>()) {
		const reference = changetype<usize>(value);
		if (reference == 0) {
			return false;
		}

		if (isString<T>()) {
			return changetype<string>(value).length > 0;
		}

		return true;
	}

	if (isBoolean<T>()) {
		return <bool>value;
	}

	if (isFloat<T>()) {
		if (sizeof<T>() == sizeof<f32>()) {
			const floatValue = <f32>value;
			return floatValue != 0.0 && !isNaN<f32>(floatValue);
		}

		const floatValue = <f64>value;
		return floatValue != 0.0 && !isNaN<f64>(floatValue);
	}

	return value != 0;
}

export class ContextBox {
	private values: Map<string, string> = new Map<string, string>();

	get isSet(): bool {
		return this.values.size > 0;
	}

	clear(): void {
		this.values.clear();
	}

	has(key: string): bool {
		return this.values.has(key);
	}

	get(key: string, fallback: string = ""): string {
		return this.values.has(key) ? this.values.get(key) : fallback;
	}

	set(key: string, value: string): void {
		this.values.set(key, value);
	}

	delete(key: string): void {
		this.values.delete(key);
	}
}

function defaultMessage(
	message: string | null,
	fallback: string,
): string | null {
	return message === null ? fallback : message;
}

export class ExecutionContext {
	get title(): string {
		const activeTitle = getActiveExecutionTargetName();
		return activeTitle.length > 0 ? activeTitle : currentNode.name;
	}

	get context(): ContextBox {
		return sharedContextBox;
	}

	get passed(): bool {
		return changetype<InternalTestContext>(this).passed;
	}

	get error(): usize {
		return changetype<InternalTestContext>(this).error;
	}

	get attempt(): i32 {
		return changetype<InternalTestContext>(this).attempt;
	}

	log(message: string): void {
		emitDiagnostic(currentNode.getNodeIndex(), message);
	}

	pass(_message: string | null = null): void {
		recordAssertionCall();
	}

	fail(message: string | null = null): void {
		recordAssertionCall();
		assertCondition(false, defaultMessage(message, "ava fail assertion"));
	}

	assert<T>(value: T, message: string | null = null): void {
		recordAssertionCall();
		assertTruthy(value, defaultMessage(message, "ava assert assertion"));
	}

	truthy<T>(value: T, message: string | null = null): void {
		recordAssertionCall();
		assertTruthy(value, defaultMessage(message, "ava truthy assertion"));
	}

	falsy<T>(value: T, message: string | null = null): void {
		recordAssertionCall();
		assertCondition(
			!isTruthyValue(value),
			defaultMessage(message, "ava falsy assertion"),
		);
	}

	true(value: bool, message: string | null = null): void {
		recordAssertionCall();
		assertStrictEqual<bool>(
			value,
			true,
			defaultMessage(message, "ava true assertion"),
		);
	}

	false(value: bool, message: string | null = null): void {
		recordAssertionCall();
		assertStrictEqual<bool>(
			value,
			false,
			defaultMessage(message, "ava false assertion"),
		);
	}

	is<T>(actual: T, expected: T, message: string | null = null): void {
		recordAssertionCall();
		assertStrictEqual(
			actual,
			expected,
			defaultMessage(message, "ava is assertion"),
		);
	}

	not<T>(actual: T, expected: T, message: string | null = null): void {
		recordAssertionCall();
		assertNotStrictEqual(
			actual,
			expected,
			defaultMessage(message, "ava not assertion"),
		);
	}

	deepEqual<T>(actual: T, expected: T, message: string | null = null): void {
		recordAssertionCall();
		assertDeepStrictEqual(
			actual,
			expected,
			defaultMessage(message, "ava deepEqual assertion"),
		);
	}

	notDeepEqual<T>(actual: T, expected: T, message: string | null = null): void {
		recordAssertionCall();
		assertNotDeepStrictEqual(
			actual,
			expected,
			defaultMessage(message, "ava notDeepEqual assertion"),
		);
	}

	like<Actual, Expected>(
		actual: Actual,
		expected: Expected,
		message: string | null = null,
	): void {
		recordAssertionCall();
		assertCondition(
			isPartialMatch(actual, expected),
			defaultMessage(message, "ava like assertion"),
		);
	}

	throws(callback: () => void, message: string | null = null): void {
		recordAssertionCall();
		assertThrows(callback, defaultMessage(message, "ava throws assertion"));
	}

	notThrows(callback: () => void, message: string | null = null): void {
		recordAssertionCall();
		assertDoesNotThrow(
			callback,
			defaultMessage(message, "ava notThrows assertion"),
		);
	}
}

export type TestFn = (context: ExecutionContext) => void;
export type HookFn = (context: ExecutionContext) => void;
export type MacroFn<T> = (context: ExecutionContext, args: Array<T>) => void;
export type TitleFn<T> = (providedTitle: string, args: Array<T>) => string;

export class Macro<T> {
	readonly exec: MacroFn<T>;
	readonly title: TitleFn<T> | null;

	constructor(exec: MacroFn<T>, title: TitleFn<T> | null = null) {
		this.exec = exec;
		this.title = title;
	}
}

export class Meta {
	get file(): string {
		return "";
	}

	get snapshotDirectory(): string {
		return "";
	}
}

export const sharedExecutionContext = new ExecutionContext();
export const sharedContextBox = new ContextBox();
export const sharedMeta = new Meta();
