import { SuiteContext, TestContext } from "../../node_test";
import {
  clearActiveHookPhase,
  clearActiveNodeIndex,
  clearActiveTraversalTarget,
  getActiveHookPhase,
  getActiveNodeIndexElement,
  getActiveNodeIndexLength,
  getActiveTraversalTargetElement,
  getActiveTraversalTargetLength,
  hasActiveNodeIndex,
  hasActiveTraversalTarget,
} from "../../internal/execution-state";
import { executeNode } from "../../internal/executor";
import { HookKind, NodeKind } from "../../internal/imports";
import { currentNode, Node } from "../../internal/node";
import {
  discoverChildrenByIndexFrom,
  runNodeByIndexFrom,
} from "../../internal/traversal";

const stateTrace = new Array<string>();

function resetStateTrace(): void {
  stateTrace.length = 0;
}

function serializeActiveNodeIndex(): string {
  if (!hasActiveNodeIndex()) {
    return "none";
  }

  const length = getActiveNodeIndexLength();
  let result = "[";
  for (let index = 0; index < length; index++) {
    if (index > 0) {
      result += ",";
    }

    result += getActiveNodeIndexElement(index).toString();
  }

  return result + "]";
}

function serializeActiveTraversalTarget(): string {
  if (!hasActiveTraversalTarget()) {
    return "none";
  }

  const length = getActiveTraversalTargetLength();
  let result = "[";
  for (let index = 0; index < length; index++) {
    if (index > 0) {
      result += ",";
    }

    result += getActiveTraversalTargetElement(index).toString();
  }

  return result + "]";
}

function recordActiveState(label: string): void {
  stateTrace.push(
    label +
      "|" +
      getActiveHookPhase().toString() +
      "|" +
      serializeActiveNodeIndex() +
      "|" +
      serializeActiveTraversalTarget(),
  );
}

function assertNoActiveState(): void {
  assert(getActiveHookPhase() == 0);
  assert(!hasActiveNodeIndex());
  assert(getActiveNodeIndexLength() == -1);
  assert(!hasActiveTraversalTarget());
  assert(getActiveTraversalTargetLength() == -1);
}

function beforeEachRoot(_context: TestContext): void {
  recordActiveState("root beforeEach");
}

function beforeEachChild(_context: TestContext): void {
  recordActiveState("child beforeEach");
}

function afterEachChild(_context: TestContext): void {
  recordActiveState("child afterEach");
}

function afterEachRoot(_context: TestContext): void {
  recordActiveState("root afterEach");
}

function executeTrackedTest(_context: TestContext): void {
  recordActiveState("child test");
}

function declareTrackedRootChildren(_context: SuiteContext): void {
  recordActiveState("root discover");
  const child = currentNode.createChild(NodeKind.Test, "plain");
  child.setTestCallback(executeTrackedTest);
}

function declareTrackedNestedChildren(_context: SuiteContext): void {
  recordActiveState("suite discover");
  const child = currentNode.createChild(NodeKind.Test, "nested");
  child.setTestCallback(executeTrackedTest);
}

function testExecuteNodeTracksHookPhaseAndNodeIndex(): void {
  assertNoActiveState();
  resetStateTrace();

  const root = new Node(NodeKind.Describe, "root");
  root.registerHook(HookKind.BeforeEach, beforeEachRoot);
  root.registerHook(HookKind.AfterEach, afterEachRoot);

  const child = root.createChild(NodeKind.Test, "child");
  child.registerHook(HookKind.BeforeEach, beforeEachChild);
  child.registerHook(HookKind.AfterEach, afterEachChild);
  child.setTestCallback(executeTrackedTest);

  assert(executeNode(child));
  assert(stateTrace.length == 5);
  assert(stateTrace[0] == "root beforeEach|2|[]|none");
  assert(stateTrace[1] == "child beforeEach|2|[0]|none");
  assert(stateTrace[2] == "child test|0|[0]|none");
  assert(stateTrace[3] == "child afterEach|3|[0]|none");
  assert(stateTrace[4] == "root afterEach|3|[]|none");
  assertNoActiveState();
}

function testDiscoverChildrenByIndexFromTracksTraversalTarget(): void {
  assertNoActiveState();
  resetStateTrace();

  const localRoot = new Node(NodeKind.Root, "local root");
  localRoot.setSuiteCallback(declareTrackedRootChildren);

  assert(discoverChildrenByIndexFrom(localRoot, [] as StaticArray<u32>) == 1);
  assert(stateTrace.length == 1);
  assert(stateTrace[0] == "root discover|0|none|[]");
  assertNoActiveState();
}

function testRunNodeByIndexFromTracksTraversalTargetDuringReplay(): void {
  assertNoActiveState();
  resetStateTrace();

  const localRoot = new Node(NodeKind.Root, "local root");
  const suite = localRoot.createChild(NodeKind.Describe, "suite");
  suite.setSuiteCallback(declareTrackedNestedChildren);

  assert(discoverChildrenByIndexFrom(localRoot, [0] as StaticArray<u32>) == 1);
  assert(runNodeByIndexFrom(localRoot, [0, 0] as StaticArray<u32>));
  assert(stateTrace.length == 3);
  assert(stateTrace[0] == "suite discover|0|none|[0]");
  assert(stateTrace[1] == "suite discover|0|none|[0,0]");
  assert(stateTrace[2] == "child test|0|[0,0]|[0,0]");
  assertNoActiveState();
}

function testTraversalStateResetsAfterMissingTargets(): void {
  assertNoActiveState();
  resetStateTrace();

  const localRoot = new Node(NodeKind.Root, "local root");
  const child = localRoot.createChild(NodeKind.Test, "plain");
  child.setTestCallback(executeTrackedTest);

  assert(discoverChildrenByIndexFrom(localRoot, [1] as StaticArray<u32>) == -1);
  assertNoActiveState();
  assert(!runNodeByIndexFrom(localRoot, [1] as StaticArray<u32>));
  assertNoActiveState();
  assert(stateTrace.length == 0);
}

testExecuteNodeTracksHookPhaseAndNodeIndex();
testDiscoverChildrenByIndexFromTracksTraversalTarget();
testRunNodeByIndexFromTracksTraversalTargetDuringReplay();
testTraversalStateResetsAfterMissingTargets();
