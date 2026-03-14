import { SuiteContext, TestContext } from "../../node:test";
import { NodeKind } from "../../internal/imports";
import { currentNode, Node } from "../../internal/node";
import {
  discoverImmediateChildrenOf,
  findNodeByIndexFrom,
  runNodeByIndexFrom,
} from "../../internal/traversal";

const executionTrace = new Array<string>();

function resetExecutionTrace(): void {
  executionTrace.length = 0;
}

function pushTrace(value: string): void {
  executionTrace.push(value);
}

function nestedTestCallback(_context: TestContext): void {
  pushTrace("nested test");
}

function plainTestCallback(_context: TestContext): void {
  pushTrace("plain test");
}

function declareNestedSuite(_context: SuiteContext): void {
  const nested = currentNode.createChild(NodeKind.Test, "nested");
  nested.setTestCallback(nestedTestCallback);
}

function testFindNodeByIndexFromDiscoversNestedChildren(): void {
  const localRoot = new Node(NodeKind.Root, "local root");
  const plain = localRoot.createChild(NodeKind.Test, "plain");
  plain.setTestCallback(plainTestCallback);

  const suite = localRoot.createChild(NodeKind.Describe, "suite");
  suite.setSuiteCallback(declareNestedSuite);

  const found = findNodeByIndexFrom(localRoot, [1, 0] as StaticArray<u32>);
  assert(found !== null);
  if (found !== null) {
    assert(found.name == "nested");
  }
}

function testFindNodeByIndexFromRejectsMissingOrdinals(): void {
  const localRoot = new Node(NodeKind.Root, "local root");
  localRoot.createChild(NodeKind.Test, "plain");

  const found = findNodeByIndexFrom(localRoot, [1] as StaticArray<u32>);
  assert(found === null);
}

function testRunNodeByIndexFromExecutesResolvedNode(): void {
  resetExecutionTrace();

  const localRoot = new Node(NodeKind.Root, "local root");
  const plain = localRoot.createChild(NodeKind.Test, "plain");
  plain.setTestCallback(plainTestCallback);

  assert(runNodeByIndexFrom(localRoot, [0] as StaticArray<u32>));
  assert(executionTrace.length == 1);
  assert(executionTrace[0] == "plain test");
}

function testDiscoverImmediateChildrenOfCountsTopLevelNodes(): void {
  const localRoot = new Node(NodeKind.Root, "local root");
  localRoot.createChild(NodeKind.Test, "plain");
  localRoot.createChild(NodeKind.Describe, "suite");

  assert(discoverImmediateChildrenOf(localRoot) == 2);
}

testFindNodeByIndexFromDiscoversNestedChildren();
testFindNodeByIndexFromRejectsMissingOrdinals();
testRunNodeByIndexFromExecutesResolvedNode();
testDiscoverImmediateChildrenOfCountsTopLevelNodes();
