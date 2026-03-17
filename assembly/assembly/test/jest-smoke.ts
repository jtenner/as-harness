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
    test("skipped by xdescribe", (_testContext: TestContext): void => {});
  });

  xtest("xtest leaf", (_context: TestContext): void => {});
  xit("xit leaf", (_context: TestContext): void => {});
  test.todo("todo leaf", (_context: TestContext): void => {});
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
    context.diagnostic("jest smoke diagnostic");
  });
});
