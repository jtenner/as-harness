import { SuiteContext, TestContext } from "../../node_test";
import { DeclarationMode, NodeKind } from "../../internal/imports";
import { currentNode, Node, NodeExecutionOptions } from "../../internal/node";
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

let replayedChildDiscoveryCount = 0;

function declareReplaySensitiveSuite(_context: SuiteContext): void {
  replayedChildDiscoveryCount++;
  if (replayedChildDiscoveryCount == 1) {
    const nested = currentNode.createChild(NodeKind.Test, "replayed nested");
    nested.setTestCallback(nestedTestCallback);
  }
}

function createOnlyOptions(): NodeExecutionOptions {
  const options = new NodeExecutionOptions();
  options.only = true;
  return options;
}

function declareOnlyNestedSuite(_context: SuiteContext): void {
  const onlyNested = currentNode.createChild(
    NodeKind.Test,
    "only nested",
    DeclarationMode.Normal,
    null,
    createOnlyOptions(),
  );
  onlyNested.setTestCallback(nestedTestCallback);

  const plainNested = currentNode.createChild(NodeKind.Test, "plain nested");
  plainNested.setTestCallback(plainTestCallback);
}

function stableLeafTestCallback(_context: TestContext): void {
  pushTrace("stable leaf");
}

function stableParentTestCallback(_context: TestContext): void {
  const stableLeaf = currentNode.createChild(NodeKind.Test, "stable leaf");
  stableLeaf.setTestCallback(stableLeafTestCallback);
}

function declareStableReplaySuite(_context: SuiteContext): void {
  const stableParent = currentNode.createChild(NodeKind.Test, "stable parent");
  stableParent.setTestCallback(stableParentTestCallback);
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

function testFindNodeByIndexFromRediscoversAncestorsOnEveryAttempt(): void {
  replayedChildDiscoveryCount = 0;

  const localRoot = new Node(NodeKind.Root, "local root");
  const suite = localRoot.createChild(NodeKind.Describe, "suite");
  suite.setSuiteCallback(declareReplaySensitiveSuite);

  const firstFound = findNodeByIndexFrom(localRoot, [0, 0] as StaticArray<u32>);
  assert(firstFound !== null);

  const secondFound = findNodeByIndexFrom(localRoot, [0, 0] as StaticArray<u32>);
  assert(secondFound === null);
}

function testDiscoverImmediateChildrenOfFiltersOnlyChildren(): void {
  const localRoot = new Node(NodeKind.Root, "local root");
  localRoot.createChild(NodeKind.Test, "plain before");
  localRoot.createChild(
    NodeKind.Test,
    "only child",
    DeclarationMode.Normal,
    null,
    createOnlyOptions(),
  );
  localRoot.createChild(NodeKind.Test, "plain after");

  assert(discoverImmediateChildrenOf(localRoot) == 1);
}

function testRunNodeByIndexFromRejectsNonOnlyTargets(): void {
  resetExecutionTrace();

  const localRoot = new Node(NodeKind.Root, "local root");
  const plain = localRoot.createChild(NodeKind.Test, "plain");
  plain.setTestCallback(plainTestCallback);
  const onlyChild = localRoot.createChild(
    NodeKind.Test,
    "only child",
    DeclarationMode.Normal,
    null,
    createOnlyOptions(),
  );
  onlyChild.setTestCallback(nestedTestCallback);

  assert(!runNodeByIndexFrom(localRoot, [0] as StaticArray<u32>));
  assert(runNodeByIndexFrom(localRoot, [1] as StaticArray<u32>));
  assert(executionTrace.length == 1);
  assert(executionTrace[0] == "nested test");
}

function testDiscoverAndRunNestedOnlyChildren(): void {
  resetExecutionTrace();

  const localRoot = new Node(NodeKind.Root, "local root");
  const suite = localRoot.createChild(NodeKind.Describe, "suite");
  suite.setSuiteCallback(declareOnlyNestedSuite);

  assert(discoverChildrenByIndexFrom(localRoot, [0] as StaticArray<u32>) == 1);
  assert(runNodeByIndexFrom(localRoot, [0, 0] as StaticArray<u32>));
  assert(!runNodeByIndexFrom(localRoot, [0, 1] as StaticArray<u32>));
  assert(executionTrace.length == 1);
  assert(executionTrace[0] == "nested test");
}

function testReplayDeterministicallyRediscoversNestedDescribeAndTestTrees(): void {
  resetExecutionTrace();

  const localRoot = new Node(NodeKind.Root, "local root");
  const suite = localRoot.createChild(NodeKind.Describe, "stable suite");
  suite.setSuiteCallback(declareStableReplaySuite);

  assert(discoverChildrenByIndexFrom(localRoot, [0] as StaticArray<u32>) == 1);
  assert(discoverChildrenByIndexFrom(localRoot, [0] as StaticArray<u32>) == 1);
  assert(discoverChildrenByIndexFrom(localRoot, [0, 0] as StaticArray<u32>) == 1);
  assert(discoverChildrenByIndexFrom(localRoot, [0, 0] as StaticArray<u32>) == 1);

  const firstLeaf = findNodeByIndexFrom(localRoot, [0, 0, 0] as StaticArray<u32>);
  assert(firstLeaf !== null);
  if (firstLeaf !== null) {
    assert(firstLeaf.name == "stable leaf");
  }

  const secondLeaf = findNodeByIndexFrom(localRoot, [0, 0, 0] as StaticArray<u32>);
  assert(secondLeaf !== null);
  if (secondLeaf !== null) {
    assert(secondLeaf.name == "stable leaf");
  }

  assert(runNodeByIndexFrom(localRoot, [0, 0, 0] as StaticArray<u32>));
  assert(runNodeByIndexFrom(localRoot, [0, 0, 0] as StaticArray<u32>));
  assert(executionTrace.length == 2);
  assert(executionTrace[0] == "stable leaf");
  assert(executionTrace[1] == "stable leaf");
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
testFindNodeByIndexFromRediscoversAncestorsOnEveryAttempt();
testDiscoverImmediateChildrenOfFiltersOnlyChildren();
testRunNodeByIndexFromRejectsNonOnlyTargets();
testDiscoverAndRunNestedOnlyChildren();
testReplayDeterministicallyRediscoversNestedDescribeAndTestTrees();
