import { SuiteContext, TestContext } from "../../node:test";
import { DeclarationMode, NodeKind } from "../../internal/imports";
import { currentNode, Node } from "../../internal/node";
import {
  discoverChildrenByIndexFrom,
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

function testDiscoverChildrenByIndexFromCountsNestedChildren(): void {
  const localRoot = new Node(NodeKind.Root, "local root");
  const suite = localRoot.createChild(NodeKind.Describe, "suite");
  suite.setSuiteCallback(declareNestedSuite);

  assert(discoverChildrenByIndexFrom(localRoot, [0] as StaticArray<u32>) == 1);
}

function testDiscoverChildrenByIndexFromRejectsMissingNodes(): void {
  const localRoot = new Node(NodeKind.Root, "local root");
  localRoot.createChild(NodeKind.Test, "plain");

  assert(discoverChildrenByIndexFrom(localRoot, [1] as StaticArray<u32>) == -1);
}

function testDiscoverImmediateChildrenOfSkipsSkippedParents(): void {
  const localRoot = new Node(NodeKind.Root, "local root");
  const skipped = localRoot.createChild(
    NodeKind.Test,
    "skipped",
    DeclarationMode.Skip,
  );
  skipped.setTestCallback(plainTestCallback);

  assert(discoverImmediateChildrenOf(skipped) == 0);
}

function testFindNodeByIndexFromPrunesSkippedBranches(): void {
  const localRoot = new Node(NodeKind.Root, "local root");
  const skipped = localRoot.createChild(
    NodeKind.Describe,
    "skipped",
    DeclarationMode.Skip,
  );
  skipped.setSuiteCallback(declareNestedSuite);

  const found = findNodeByIndexFrom(localRoot, [0, 0] as StaticArray<u32>);
  assert(found === null);
}

function testDiscoverChildrenByIndexFromAllowsTodoBranches(): void {
  const localRoot = new Node(NodeKind.Root, "local root");
  const todoParent = localRoot.createChild(
    NodeKind.Describe,
    "todo parent",
    DeclarationMode.Todo,
  );
  todoParent.setSuiteCallback(declareNestedSuite);

  assert(discoverChildrenByIndexFrom(localRoot, [0] as StaticArray<u32>) == 1);
}

testFindNodeByIndexFromDiscoversNestedChildren();
testFindNodeByIndexFromRejectsMissingOrdinals();
testRunNodeByIndexFromExecutesResolvedNode();
testDiscoverImmediateChildrenOfCountsTopLevelNodes();
testDiscoverChildrenByIndexFromCountsNestedChildren();
testDiscoverChildrenByIndexFromRejectsMissingNodes();
testDiscoverImmediateChildrenOfSkipsSkippedParents();
testFindNodeByIndexFromPrunesSkippedBranches();
testDiscoverChildrenByIndexFromAllowsTodoBranches();
