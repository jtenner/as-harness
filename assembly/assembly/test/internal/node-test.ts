import {
	DeclarationMode,
	FailurePolicyHint,
	HookKind,
	NodeKind,
	RunnerModeHint,
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
} from "../../node_test";

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
	context.plan(2);
	context.assert.equal<i32>(1, 1);
	context.assert.deepEqual<i32>(2, 2);
	context.inBand();
	context.bail();
	context.runOnly(true);
	const runOnlyChild = context.test("run-only child", noopTest);
	context.runOnly(false);
	context
		.test("plain child", noopTest)
		.dependsOn(runOnlyChild)
		.continueOnFailure();
	context.beforeEach(noopHook);
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
	context.inBand();
	context.continueOnFailure();
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
	assert(plainTest.preferredRunnerMode == RunnerModeHint.Default);
	assert(plainTest.preferredFailurePolicy == FailurePolicyHint.Inherit);

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
	assert(nestedChildren.length == 2);

	const runOnlyNested = unchecked(nestedChildren[0]);
	assert(runOnlyNested.kind == NodeKind.Test);
	assert(runOnlyNested.name == "run-only child");
	assert(runOnlyNested.only);
	assert(runOnlyNested.preferredRunnerMode == RunnerModeHint.Default);
	assert(runOnlyNested.preferredFailurePolicy == FailurePolicyHint.Inherit);

	const plainNested = unchecked(nestedChildren[1]);
	assert(plainNested.kind == NodeKind.Test);
	assert(plainNested.name == "plain child");
	assert(!plainNested.only);
	assert(parent.preferredRunnerMode == RunnerModeHint.InBand);
	assert(parent.preferredFailurePolicy == FailurePolicyHint.Bail);
	assert(plainNested.preferredFailurePolicy == FailurePolicyHint.Continue);
	const dependencyNodeIds = plainNested.getDependencyNodeIds();
	assert(dependencyNodeIds.length == 1);
	assert(unchecked(dependencyNodeIds[0]) == runOnlyNested.nodeId);

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
	assert(unchecked(children[2]).preferredRunnerMode == RunnerModeHint.InBand);
	assert(
		unchecked(children[2]).preferredFailurePolicy == FailurePolicyHint.Continue,
	);

	resetCurrentNode();
}

function testNodeTestDependencyHandles(): void {
	const localRoot = new Node(NodeKind.Root, "local root");
	setCurrentNode(localRoot);

	const prereq = test("dependency prereq", noopTest);
	const dependent = test("dependency dependent", noopTest);
	const chained = dependent.dependsOn(prereq).inBand().bail();

	assert(chained === dependent);

	const children = localRoot.getChildren();
	assert(children.length == 2);

	const prereqNode = unchecked(children[0]);
	const dependentNode = unchecked(children[1]);
	const dependencyNodeIds = dependentNode.getDependencyNodeIds();
	assert(dependencyNodeIds.length == 1);
	assert(unchecked(dependencyNodeIds[0]) == prereqNode.nodeId);
	assert(dependentNode.preferredRunnerMode == RunnerModeHint.InBand);
	assert(dependentNode.preferredFailurePolicy == FailurePolicyHint.Bail);

	resetCurrentNode();
}

testNodeTestDeclarationRegistration();
testNodeTestAnonymousNames();
testNodeTestContextMethods();
testNodeTestContextSkipAndTodo();
testNodeTestDependencyHandles();
