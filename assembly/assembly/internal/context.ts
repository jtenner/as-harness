// Minimal declaration-time contexts for the early `node:test` adapter passes.
// These expose the declaration-time methods that can be supported before
// runnable execution and per-attempt state exist.

import { HookKind } from "./imports";
import { declareTestNode, registerHook } from "./api";
import { HookCallback } from "./hooks";
import {
  doesNotThrow,
  fail,
  ifError,
  notDeepStrictEqual,
  notStrictEqual,
  ok,
  strictEqual,
  throws,
  deepStrictEqual,
} from "../node:assert/shared";

export class AssertionFacade {
  ok<T>(value: T, message: string | null = null): void {
    ok(value, message);
  }

  equal<T>(actual: T, expected: T, message: string | null = null): void {
    strictEqual(actual, expected, message);
  }

  notEqual<T>(actual: T, expected: T, message: string | null = null): void {
    notStrictEqual(actual, expected, message);
  }

  deepEqual<T>(actual: T, expected: T, message: string | null = null): void {
    deepStrictEqual(actual, expected, message);
  }

  notDeepEqual<T>(
    actual: T,
    expected: T,
    message: string | null = null,
  ): void {
    notDeepStrictEqual(actual, expected, message);
  }

  strictEqual<T>(
    actual: T,
    expected: T,
    message: string | null = null,
  ): void {
    strictEqual(actual, expected, message);
  }

  notStrictEqual<T>(
    actual: T,
    expected: T,
    message: string | null = null,
  ): void {
    notStrictEqual(actual, expected, message);
  }

  deepStrictEqual<T>(
    actual: T,
    expected: T,
    message: string | null = null,
  ): void {
    deepStrictEqual(actual, expected, message);
  }

  notDeepStrictEqual<T>(
    actual: T,
    expected: T,
    message: string | null = null,
  ): void {
    notDeepStrictEqual(actual, expected, message);
  }

  throws(
    callback: () => void,
    message: string | null = null,
  ): void {
    throws(callback, message);
  }

  doesNotThrow(
    callback: () => void,
    message: string | null = null,
  ): void {
    doesNotThrow(callback, message);
  }

  ifError<T>(value: T): void {
    ifError(value);
  }

  fail(message: string | null = null): void {
    fail(message);
  }
}

function declareNestedTest(
  name: string = "",
  callback: ((context: TestContext) => void) | null = null,
): void {
  declareTestNode(name, callback);
}

function registerContextHook(
  kind: HookKind,
  callback: HookCallback | null = null,
): void {
  registerHook(kind, callback);
}

export class SuiteContext {}

export class TestContext {
  get assert(): AssertionFacade {
    return sharedAssertionFacade;
  }

  test(
    name: string = "",
    callback: ((context: TestContext) => void) | null = null,
  ): void {
    declareNestedTest(name, callback);
  }

  before(callback: HookCallback | null = null): void {
    registerContextHook(HookKind.BeforeAll, callback);
  }

  after(callback: HookCallback | null = null): void {
    registerContextHook(HookKind.AfterAll, callback);
  }

  beforeEach(callback: HookCallback | null = null): void {
    registerContextHook(HookKind.BeforeEach, callback);
  }

  afterEach(callback: HookCallback | null = null): void {
    registerContextHook(HookKind.AfterEach, callback);
  }
}

export const sharedAssertionFacade = new AssertionFacade();
export const sharedSuiteContext = new SuiteContext();
export const sharedTestContext = new TestContext();
