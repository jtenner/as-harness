import assert from "../node_assert";
import {
	deepStrictEqual,
	doesNotThrow,
	equal,
	fail,
	ifError,
	notEqual,
	notDeepStrictEqual,
	notStrictEqual,
	ok,
	strictEqual,
	throws,
} from "../node_assert";
import { strict } from "../node_assert";
export { invoke } from "../internal/trampoline";

export function runDeepStrictEqualPass(): void {
	deepStrictEqual<i32>(11, 11);
}

export function runDefaultAssertPass(): void {
	assert("alpha");
}

export function runOkPass(): void {
	ok("alpha");
}

export function runStrictEqualPass(): void {
	strictEqual<i32>(11, 11);
}

export function runStrictNamespaceEqualPass(): void {
	strict.equal<i32>(11, 11);
}

export function runEqualPass(): void {
	equal<i32, string>(1, "1");
}

export function runNotStrictEqualPass(): void {
	notStrictEqual<i32>(11, 12);
}

export function runNotEqualPass(): void {
	notEqual<i32, string>(1, "2");
}

export function runNotDeepStrictEqualPass(): void {
	notDeepStrictEqual<Array<i32>>([1, 2], [1, 3]);
}

export function runThrowsPass(): void {
	throws((): void => {
		unreachable();
	});
}

export function runThrowsPassWithInnerFailMessage(): void {
	throws((): void => {
		strictEqual<i32>(11, 12, "throws inner mismatch");
	});
}

export function runDoesNotThrowPass(): void {
	doesNotThrow((): void => {});
}

export function runIfErrorPass(): void {
	ifError<string | null>(null);
}

export function runDeepStrictEqualFailWithMessage(): void {
	deepStrictEqual<i32>(11, 12, "deepStrictEqual mismatch");
}

export function runDeepStrictEqualFailWithoutMessage(): void {
	deepStrictEqual<i32>(11, 12);
}

export function runDefaultAssertFailWithMessage(): void {
	assert("", "assert mismatch");
}

export function runOkFailWithMessage(): void {
	ok("", "ok mismatch");
}

export function runStrictEqualFailWithMessage(): void {
	strictEqual<i32>(11, 12, "strictEqual mismatch");
}

export function runStrictNamespaceEqualFailWithMessage(): void {
	strict.equal<i32>(11, 12, "strict namespace equal mismatch");
}

export function runEqualFailWithMessage(): void {
	equal<i32, string>(1, "2", "equal mismatch");
}

export function runNotStrictEqualFailWithMessage(): void {
	notStrictEqual<i32>(11, 11, "notStrictEqual mismatch");
}

export function runNotEqualFailWithMessage(): void {
	notEqual<i32, string>(1, "1", "notEqual mismatch");
}

export function runNotDeepStrictEqualFailWithMessage(): void {
	notDeepStrictEqual<Array<i32>>([1, 2], [1, 2], "notDeepStrictEqual mismatch");
}

export function runThrowsFailWithMessage(): void {
	throws((): void => {}, "throws mismatch");
}

export function runDoesNotThrowFailWithMessage(): void {
	doesNotThrow((): void => {
		unreachable();
	}, "doesNotThrow mismatch");
}

export function runIfErrorFailWithoutMessage(): void {
	ifError<string>("boom");
}

export function runFailWithMessage(): void {
	fail("fail mismatch");
}
