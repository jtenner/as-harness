import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  fit,
  fdescribe,
  test,
  TestContext,
  xdescribe,
  xit,
  xtest,
} from "jest";

export { allocateNodeIndexBuffer, discover, invoke, run } from "../exports";

let beforeEachCount = 0;
let afterEachCount = 0;
let suiteSetupCount = 0;

function throwsUnreachable(): void {
  unreachable();
}

function shouldNeverExecuteSkipAlias(): void {
  unreachable();
}

const strictArrayNeedle = [2, 3];
const strictSetNeedle = [5, 6];
const strictMapKey = [7, 8];

const arrayLikeValues = new Uint8Array(3);
arrayLikeValues[0] = 9;
arrayLikeValues[1] = 10;
arrayLikeValues[2] = 11;

const strictArrayHaystack = [strictArrayNeedle, [4, 5]];

const strictSetHaystack = new Set<Array<i32>>();
strictSetHaystack.add(strictSetNeedle);

const strictMapHaystack = new Map<Array<i32>, string>();
strictMapHaystack.set(strictMapKey, "mapped");

beforeAll((_context: TestContext): void => {
  suiteSetupCount = 1;
});

beforeEach((_context: TestContext): void => {
  beforeEachCount++;
});

afterEach((_context: TestContext): void => {
  afterEachCount++;
});

describe("jest adapter", (_context): void => {
  xdescribe("xdescribe branch", (_nestedContext): void => {
    shouldNeverExecuteSkipAlias();
  });

  xtest("xtest leaf", (_context: TestContext): void => {
    shouldNeverExecuteSkipAlias();
  });
  xit("xit leaf", (_context: TestContext): void => {
    shouldNeverExecuteSkipAlias();
  });
  test.todo("todo leaf", (_context: TestContext): void => {
    shouldNeverExecuteSkipAlias();
  });
  fit("only alias leaf", (_context: TestContext): void => {});
  fdescribe("only alias suite", (_context): void => {
    test("nested only alias child", (_context: TestContext): void => {});
  });

  test("runs hooks and assertions", (context: TestContext): void => {
    expect<i32>(suiteSetupCount).toBe(1);
    expect<i32>(beforeEachCount).toBe(1);
    expect<i32>(afterEachCount).toBeFalsy();
    expect<Array<i32>>([1, 2, 3]).toEqual([1, 2, 3]);
    expect<Array<i32>>([1, 2, 3]).not.toEqual([1, 2, 4]);
    expect<Array<Array<i32>>>(strictArrayHaystack).toContain(strictArrayNeedle);
    expect<Array<Array<i32>>>(strictArrayHaystack).toContainEqual([2, 3]);
    expect<Array<Array<i32>>>(strictArrayHaystack).not.toContainEqual([8, 9]);
    expect<Uint8Array>(arrayLikeValues).toContain(<u8>10);
    expect<Uint8Array>(arrayLikeValues).not.toContain(<u8>12);
    expect<Set<Array<i32>>>(strictSetHaystack).toContain(strictSetNeedle);
    expect<Set<Array<i32>>>(strictSetHaystack).toContainEqual([5, 6]);
    expect<Map<Array<i32>, string>>(strictMapHaystack).toContain(strictMapKey);
    expect<Map<Array<i32>, string>>(strictMapHaystack).toContainEqual([7, 8]);
    expect<Array<i32>>([1, 2, 3]).toHaveLength(3);
    expect<Uint8Array>(arrayLikeValues).toHaveLength(3);
    expect<Set<Array<i32>>>(strictSetHaystack).toHaveLength(1);
    expect<Map<Array<i32>, string>>(strictMapHaystack).toHaveLength(1);
    expect<i32>(5).toBeGreaterThan(4);
    expect<i32>(4).not.toBeGreaterThan(5);
    expect<i32>(4).toBeLessThan(5);
    expect<i32>(5).not.toBeLessThan(4);
    expect<f64>(NaN).toBeNaN();
    expect<f64>(1.25).not.toBeNaN();
    expect<() => void>(throwsUnreachable).toThrow();
    expect<() => void>(((): void => {})).not.toThrow();
    context.diagnostic("jest smoke diagnostic");
  });
});
