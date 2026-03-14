import {
  deepStrictEqual,
  doesNotThrow,
  fail,
  notDeepStrictEqual,
  notStrictEqual,
  ok,
  strictEqual,
  throws,
} from "../node:assert";
export { invoke } from "../internal/trampoline";

export function runDeepStrictEqualPass(): void {
  deepStrictEqual<i32>(11, 11);
}

export function runOkPass(): void {
  ok("alpha");
}

export function runStrictEqualPass(): void {
  strictEqual<i32>(11, 11);
}

export function runNotStrictEqualPass(): void {
  notStrictEqual<i32>(11, 12);
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

export function runDeepStrictEqualFailWithMessage(): void {
  deepStrictEqual<i32>(11, 12, "deepStrictEqual mismatch");
}

export function runDeepStrictEqualFailWithoutMessage(): void {
  deepStrictEqual<i32>(11, 12);
}

export function runOkFailWithMessage(): void {
  ok("", "ok mismatch");
}

export function runStrictEqualFailWithMessage(): void {
  strictEqual<i32>(11, 12, "strictEqual mismatch");
}

export function runNotStrictEqualFailWithMessage(): void {
  notStrictEqual<i32>(11, 11, "notStrictEqual mismatch");
}

export function runNotDeepStrictEqualFailWithMessage(): void {
  notDeepStrictEqual<Array<i32>>([1, 2], [1, 2], "notDeepStrictEqual mismatch");
}

export function runThrowsFailWithMessage(): void {
  throws((): void => {}, "throws mismatch");
}

export function runDoesNotThrowFailWithMessage(): void {
  doesNotThrow(
    (): void => {
      unreachable();
    },
    "doesNotThrow mismatch",
  );
}

export function runFailWithMessage(): void {
  fail("fail mismatch");
}
