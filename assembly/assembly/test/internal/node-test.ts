import {
  DeclarationMode,
  HookKind,
  NodeKind,
} from "../../internal/imports";
import { Node, resetCurrentNode, setCurrentNode } from "../../internal/node";
import {
  before,
  beforeEach,
  describe,
  expectFailure,
  it,
  only,
  test,
  todo,
  SuiteContext,
  TestContext,
} from "../../node:test";

function noopSuite(_context: SuiteContext): void {}

function noopTest(_context: TestContext): void {}

function noopHook(_context: TestContext): void {}

function declareNestedSuite(_context: SuiteContext): void {
  beforeEach(noopHook);
  test.todo("nested todo", noopTest);
  it.only("nested only", noopTest);
}

function declareViaContext(context: TestContext): void {
  assert(context.name == "context parent");
  assert(context.fullName == "context parent");
  assert(context.filePath == "");
  assert(context.signal == 0);
  assert(!context.passed);
  assert(context.error == 0);
  assert(context.attempt == 0);
  assert(context.workerId == 0);
  context.assert.equal<i32>(1, 1);
  context.assert.deepEqual<i32>(2, 2);
  context.beforeEach(noopHook);
  context.test("context nested", noopTest);
}

function declareContextSkip(context: TestContext): void {
  context.skip("skip me");
}

function declareContextTodo(context: TestContext): void {
  context.todo("todo me");
}

function declareSuiteMetadata(context: SuiteContext): void {
  assert(context.name == "suite parent");
  assert(context.fullName == "suite parent");
  assert(context.filePath == "");
  assert(context.signal == 0);
}

function testNodeTestDeclarationRegistration(): void {
  const localRoot = new Node(NodeKind.Root, "local root");
  setCurrentNode(localRoot);

  before(noopHook);
  test("plain test", noopTest);
  describe.skip("skipped suite", declareNestedSuite);
  expectFailure("xfail test", noopTest);
  todo("top-level todo", noopTest);
  only("top-level only", noopTest);

  const rootHooks = localRoot.getHooks(HookKind.BeforeAll);
  assert(rootHooks.length == 1);
  assert(unchecked(rootHooks[0]).kind == HookKind.BeforeAll);

  const children = localRoot.getChildren();
  assert(children.length == 5);

  const plainTest = unchecked(children[0]);
  assert(plainTest.kind == NodeKind.Test);
  assert(plainTest.name == "plain test");
  assert(!plainTest.only);
  assert(!plainTest.expectFailure);

  const skippedSuite = unchecked(children[1]);
  assert(skippedSuite.kind == NodeKind.Describe);
  assert(skippedSuite.name == "skipped suite");
  assert(skippedSuite.declarationMode == DeclarationMode.Skip);

  const xfailTest = unchecked(children[2]);
  assert(xfailTest.expectFailure);

  const todoTest = unchecked(children[3]);
  assert(todoTest.declarationMode == DeclarationMode.Todo);

  const onlyTest = unchecked(children[4]);
  assert(onlyTest.only);

  const nestedHooks = skippedSuite.getHooks(HookKind.BeforeEach);
  assert(nestedHooks.length == 0);

  const nestedChildren = skippedSuite.getChildren();
  assert(nestedHooks.length == 1);
  assert(nestedChildren.length == 2);

  const nestedTodo = unchecked(nestedChildren[0]);
  assert(nestedTodo.declarationMode == DeclarationMode.Todo);

  const nestedOnly = unchecked(nestedChildren[1]);
  assert(nestedOnly.only);

  const nestedOnlyIndex = nestedOnly.getNodeIndex();
  assert(nestedOnlyIndex.length == 2);
  assert(unchecked(nestedOnlyIndex[0]) == 1);
  assert(unchecked(nestedOnlyIndex[1]) == 1);

  resetCurrentNode();
}

function testNodeTestAnonymousNames(): void {
  const localRoot = new Node(NodeKind.Root, "local root");
  setCurrentNode(localRoot);

  test("", noopTest);
  describe("", noopSuite);

  const children = localRoot.getChildren();
  assert(children.length == 2);
  assert(unchecked(children[0]).name == "<anonymous>");
  assert(unchecked(children[1]).name == "<anonymous>");

  resetCurrentNode();
}

function testNodeTestContextMethods(): void {
  const localRoot = new Node(NodeKind.Root, "local root");
  setCurrentNode(localRoot);

  test("context parent", declareViaContext);

  const children = localRoot.getChildren();
  assert(children.length == 1);

  const parent = unchecked(children[0]);
  const nestedChildren = parent.getChildren();
  const hooks = parent.getHooks(HookKind.BeforeEach);
  assert(hooks.length == 1);
  assert(nestedChildren.length == 1);

  const nested = unchecked(nestedChildren[0]);
  assert(nested.kind == NodeKind.Test);
  assert(nested.name == "context nested");

  resetCurrentNode();
}

function testNodeTestContextSkipAndTodo(): void {
  const localRoot = new Node(NodeKind.Root, "local root");
  setCurrentNode(localRoot);

  test("skip parent", declareContextSkip);
  test("todo parent", declareContextTodo);
  describe("suite parent", declareSuiteMetadata);

  const children = localRoot.getChildren();
  assert(children.length == 3);
  unchecked(children[0]).getChildren();
  unchecked(children[1]).getChildren();
  unchecked(children[2]).getChildren();
  assert(unchecked(children[0]).declarationMode == DeclarationMode.Skip);
  assert(unchecked(children[1]).declarationMode == DeclarationMode.Todo);
  assert(unchecked(children[2]).declarationMode == DeclarationMode.Normal);

  resetCurrentNode();
}

testNodeTestDeclarationRegistration();
testNodeTestAnonymousNames();
testNodeTestContextMethods();
testNodeTestContextSkipAndTodo();
