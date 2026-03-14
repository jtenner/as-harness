// Minimal declaration-time contexts for the early `node:test` adapter passes.
// These expose the declaration-time methods that can be supported before
// runnable execution and per-attempt state exist.

import { DeclarationMode, HookKind } from "./imports";
import {
  declareTestNode,
  NodeDeclarationOptions,
  registerHook,
} from "./api";
import { getActiveErrorPointer } from "./failure-state";
import {
  getActiveAttempt,
  getActiveRunOnly,
  getActiveNodePassed,
  recordAssertionCall,
  setActiveRunOnly,
  setPlannedAssertionCount,
} from "./execution-state";
import { diagnostic as emitDiagnostic } from "./events";
import { HookCallback } from "./hooks";
import { currentNode } from "./node";
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
    recordAssertionCall();
    ok(value, message);
  }

  equal<T>(actual: T, expected: T, message: string | null = null): void {
    recordAssertionCall();
    strictEqual(actual, expected, message);
  }

  notEqual<T>(actual: T, expected: T, message: string | null = null): void {
    recordAssertionCall();
    notStrictEqual(actual, expected, message);
  }

  deepEqual<T>(actual: T, expected: T, message: string | null = null): void {
    recordAssertionCall();
    deepStrictEqual(actual, expected, message);
  }

  notDeepEqual<T>(
    actual: T,
    expected: T,
    message: string | null = null,
  ): void {
    recordAssertionCall();
    notDeepStrictEqual(actual, expected, message);
  }

  strictEqual<T>(
    actual: T,
    expected: T,
    message: string | null = null,
  ): void {
    recordAssertionCall();
    strictEqual(actual, expected, message);
  }

  notStrictEqual<T>(
    actual: T,
    expected: T,
    message: string | null = null,
  ): void {
    recordAssertionCall();
    notStrictEqual(actual, expected, message);
  }

  deepStrictEqual<T>(
    actual: T,
    expected: T,
    message: string | null = null,
  ): void {
    recordAssertionCall();
    deepStrictEqual(actual, expected, message);
  }

  notDeepStrictEqual<T>(
    actual: T,
    expected: T,
    message: string | null = null,
  ): void {
    recordAssertionCall();
    notDeepStrictEqual(actual, expected, message);
  }

  throws(
    callback: () => void,
    message: string | null = null,
  ): void {
    recordAssertionCall();
    throws(callback, message);
  }

  doesNotThrow(
    callback: () => void,
    message: string | null = null,
  ): void {
    recordAssertionCall();
    doesNotThrow(callback, message);
  }

  ifError<T>(value: T): void {
    recordAssertionCall();
    ifError(value);
  }

  fail(message: string | null = null): void {
    recordAssertionCall();
    fail(message);
  }
}

function declareNestedTest(
  name: string = "",
  callback: ((context: TestContext) => void) | null = null,
): void {
  if (!getActiveRunOnly()) {
    declareTestNode(name, callback);
    return;
  }

  const options = new NodeDeclarationOptions();
  options.only = true;
  declareTestNode(name, callback, options);
}

function registerContextHook(
  kind: HookKind,
  callback: HookCallback | null = null,
): void {
  registerHook(kind, callback);
}

function fullNameForCurrentNode(): string {
  let result = currentNode.name;
  let cursor = currentNode.parent;

  while (cursor !== null && cursor.parent !== null) {
    result = cursor.name + " > " + result;
    cursor = cursor.parent;
  }

  return result;
}

function markCurrentNode(mode: DeclarationMode): void {
  currentNode.setDeclarationMode(mode);
}

export class SuiteContext {
  get name(): string {
    return currentNode.name;
  }

  get fullName(): string {
    return fullNameForCurrentNode();
  }

  get filePath(): string {
    return "";
  }

  get signal(): usize {
    return 0;
  }
}

export class TestContext {
  get assert(): AssertionFacade {
    return sharedAssertionFacade;
  }

  get name(): string {
    return currentNode.name;
  }

  get fullName(): string {
    return fullNameForCurrentNode();
  }

  get filePath(): string {
    return "";
  }

  get signal(): usize {
    return 0;
  }

  get passed(): bool {
    return getActiveNodePassed();
  }

  get error(): usize {
    return getActiveErrorPointer();
  }

  get attempt(): i32 {
    return getActiveAttempt();
  }

  get workerId(): i32 {
    return 0;
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

  diagnostic(message: string): void {
    emitDiagnostic(currentNode.getNodeIndex(), message);
  }

  plan(count: i32): void {
    setPlannedAssertionCount(count);
  }

  runOnly(shouldRunOnlyTests: bool): void {
    setActiveRunOnly(shouldRunOnlyTests);
  }

  skip(_message: string | null = null): void {
    markCurrentNode(DeclarationMode.Skip);
  }

  todo(_message: string | null = null): void {
    markCurrentNode(DeclarationMode.Todo);
  }
}

export const sharedAssertionFacade = new AssertionFacade();
export const sharedSuiteContext = new SuiteContext();
export const sharedTestContext = new TestContext();
