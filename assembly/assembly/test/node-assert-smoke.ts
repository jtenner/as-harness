import { deepStrictEqual } from "../node:assert";

export function runDeepStrictEqualPass(): void {
  deepStrictEqual<i32>(11, 11);
}

export function runDeepStrictEqualFailWithMessage(): void {
  deepStrictEqual<i32>(11, 12, "deepStrictEqual mismatch");
}

export function runDeepStrictEqualFailWithoutMessage(): void {
  deepStrictEqual<i32>(11, 12);
}
