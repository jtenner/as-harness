import { executeNode } from "../../internal/executor";
import { DeclarationMode, HookKind, NodeKind } from "../../internal/imports";
import { Node } from "../../internal/node";
import { TestContext } from "../../internal/context";

const executionTrace = new Array<string>();

function resetExecutionTrace(): void {
  executionTrace.length = 0;
}

function pushTrace(value: string): void {
  executionTrace.push(value);
}

function beforeAllRoot(_context: TestContext): void {
  pushTrace("root beforeAll");
}

function beforeEachRoot(_context: TestContext): void {
  pushTrace("root beforeEach");
}

function afterEachRoot(_context: TestContext): void {
  pushTrace("root afterEach");
}

function afterAllRoot(_context: TestContext): void {
  pushTrace("root afterAll");
}

function beforeAllChild(_context: TestContext): void {
  pushTrace("child beforeAll");
}

function beforeEachChild(_context: TestContext): void {
  pushTrace("child beforeEach");
}

function afterEachChild(_context: TestContext): void {
  pushTrace("child afterEach");
}

function afterAllChild(_context: TestContext): void {
  pushTrace("child afterAll");
}

function executeTestCallback(_context: TestContext): void {
  pushTrace("test callback");
}

function executeSuiteCallback(): void {
  pushTrace("suite callback");
}

function testExecuteNodeRunsHooksInExpectedOrder(): void {
  resetExecutionTrace();

  const root = new Node(NodeKind.Describe, "root");
  root.registerHook(HookKind.BeforeAll, beforeAllRoot);
  root.registerHook(HookKind.BeforeEach, beforeEachRoot);
  root.registerHook(HookKind.AfterEach, afterEachRoot);
  root.registerHook(HookKind.AfterAll, afterAllRoot);

  const child = root.createChild(NodeKind.Test, "child");
  child.setTestCallback(executeTestCallback);
  child.registerHook(HookKind.BeforeAll, beforeAllChild);
  child.registerHook(HookKind.BeforeEach, beforeEachChild);
  child.registerHook(HookKind.AfterEach, afterEachChild);
  child.registerHook(HookKind.AfterAll, afterAllChild);

  executeNode(child);

  assert(executionTrace.length == 9);
  assert(executionTrace[0] == "root beforeAll");
  assert(executionTrace[1] == "child beforeAll");
  assert(executionTrace[2] == "root beforeEach");
  assert(executionTrace[3] == "child beforeEach");
  assert(executionTrace[4] == "test callback");
  assert(executionTrace[5] == "child afterEach");
  assert(executionTrace[6] == "root afterEach");
  assert(executionTrace[7] == "child afterAll");
  assert(executionTrace[8] == "root afterAll");
}

function testExecuteNodeRunsPlainSuiteCallbacks(): void {
  resetExecutionTrace();

  const suite = new Node(
    NodeKind.Describe,
    "suite",
    DeclarationMode.Normal,
    executeSuiteCallback,
  );

  executeNode(suite);

  assert(executionTrace.length == 1);
  assert(executionTrace[0] == "suite callback");
}

function testExecuteNodeSkipsNonRunnableModes(): void {
  resetExecutionTrace();

  const skipped = new Node(NodeKind.Test, "skipped", DeclarationMode.Skip);
  skipped.setTestCallback(executeTestCallback);

  executeNode(skipped);

  assert(executionTrace.length == 0);
}

testExecuteNodeRunsHooksInExpectedOrder();
testExecuteNodeRunsPlainSuiteCallbacks();
testExecuteNodeSkipsNonRunnableModes();
