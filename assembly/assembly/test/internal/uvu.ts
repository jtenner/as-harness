import {
	DeclarationMode,
	FailurePolicyHint,
	HookKind,
	NodeKind,
	RunnerModeHint,
} from "../../internal/imports";
import { Node, resetCurrentNode, setCurrentNode } from "../../internal/node";
import { exec, suite, test, TestContext, UvuSuite } from "../../uvu";

function noopTest(_context: TestContext): void {}

function noopHook(_context: TestContext): void {}

function testUvuDeclarationRegistration(): void {
	const localRoot = new Node(NodeKind.Root, "local root");
	setCurrentNode(localRoot);

	test.before(noopHook);
	test.before.each(noopHook);
	test.after.each(noopHook);
	test.after(noopHook);
	test.inBand();
	test.continueOnFailure();

	test("top-level test", noopTest);
	test.only("top-level focused", noopTest);
	test.skip("top-level skipped", noopTest);

	const localSuite = suite("uvu suite");
	assert(localSuite.name == "uvu suite");
	assert(localSuite.context == 0);

	localSuite.inBand();
	localSuite.bail();
	localSuite.continueOnFailure();
	localSuite.before(noopHook);
	localSuite.beforeEach(noopHook);
	localSuite.afterEach(noopHook);
	localSuite.after(noopHook);
	localSuite.test("suite child", noopTest);
	localSuite.only("suite focused", noopTest);
	localSuite.skip("suite skipped", noopTest);
	localSuite.run();

	const contextSuite = suite<Array<i32>>("context suite", [1, 2, 3]);
	assert(contextSuite.context.length == 3);
	contextSuite.bail();
	contextSuite.continueOnFailure(false);
	contextSuite.test("context child", noopTest);

	exec(true);

	const beforeAllHooks = localRoot.getHooks(HookKind.BeforeAll);
	const beforeEachHooks = localRoot.getHooks(HookKind.BeforeEach);
	const afterEachHooks = localRoot.getHooks(HookKind.AfterEach);
	const afterAllHooks = localRoot.getHooks(HookKind.AfterAll);

	assert(beforeAllHooks.length == 1);
	assert(beforeEachHooks.length == 1);
	assert(afterEachHooks.length == 1);
	assert(afterAllHooks.length == 1);
	assert(localRoot.preferredRunnerMode == RunnerModeHint.InBand);
	assert(localRoot.preferredFailurePolicy == FailurePolicyHint.Bail);

	const children = localRoot.getChildren();
	assert(children.length == 5);

	assert(unchecked(children[0]).kind == NodeKind.Test);
	assert(unchecked(children[0]).name == "top-level test");
	assert(unchecked(children[1]).only);
	assert(unchecked(children[2]).declarationMode == DeclarationMode.Skip);
	assert(unchecked(children[3]).kind == NodeKind.Describe);
	assert(unchecked(children[4]).kind == NodeKind.Describe);

	const suiteNode = unchecked(children[3]);
	const suiteChildren = suiteNode.getChildren();
	const suiteBeforeAllHooks = suiteNode.getHooks(HookKind.BeforeAll);
	const suiteBeforeEachHooks = suiteNode.getHooks(HookKind.BeforeEach);
	const suiteAfterEachHooks = suiteNode.getHooks(HookKind.AfterEach);
	const suiteAfterAllHooks = suiteNode.getHooks(HookKind.AfterAll);

	assert(suiteBeforeAllHooks.length == 1);
	assert(suiteBeforeEachHooks.length == 1);
	assert(suiteAfterEachHooks.length == 1);
	assert(suiteAfterAllHooks.length == 1);
	assert(suiteNode.preferredRunnerMode == RunnerModeHint.InBand);
	assert(suiteNode.preferredFailurePolicy == FailurePolicyHint.Continue);
	assert(suiteChildren.length == 3);
	assert(unchecked(suiteChildren[0]).name == "suite child");
	assert(unchecked(suiteChildren[1]).only);
	assert(unchecked(suiteChildren[2]).declarationMode == DeclarationMode.Skip);

	const contextSuiteNode = unchecked(children[4]);
	const contextSuiteChildren = contextSuiteNode.getChildren();
	assert(contextSuiteNode.preferredFailurePolicy == FailurePolicyHint.Inherit);
	assert(contextSuiteChildren.length == 1);
	assert(unchecked(contextSuiteChildren[0]).name == "context child");

	resetCurrentNode();
}

function testUvuSuiteTyping(): void {
	const localRoot = new Node(NodeKind.Root, "local root");
	setCurrentNode(localRoot);

	const typedSuite = new UvuSuite<Array<i32>>(
		new Node(NodeKind.Describe, "typed"),
		[4, 5],
	);
	assert(typedSuite.context.length == 2);

	resetCurrentNode();
}

testUvuDeclarationRegistration();
testUvuSuiteTyping();
