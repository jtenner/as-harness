import { DeclarationMode, HookKind, NodeKind } from "../../internal/imports";
import { Node, resetCurrentNode, setCurrentNode } from "../../internal/node";
import {
	after,
	afterEach,
	before,
	beforeEach,
	context,
	describe,
	it,
	specify,
	SuiteContext,
	TestContext,
	xcontext,
	xdescribe,
	xit,
	xspecify,
} from "../../mocha";

function noopSuite(_context: SuiteContext): void {}

function noopTest(_context: TestContext): void {}

function noopHook(_context: TestContext): void {}

function declareNestedSuite(_context: SuiteContext): void {
	beforeEach(noopHook);
	it.only("nested only", noopTest);
	specify("nested pending");
}

function testMochaDeclarationRegistration(): void {
	const localRoot = new Node(NodeKind.Root, "local root");
	setCurrentNode(localRoot);

	before(noopHook);
	after(noopHook);
	beforeEach(noopHook);
	afterEach(noopHook);

	describe.only("focused suite", declareNestedSuite);
	context.skip("skipped suite", declareNestedSuite);
	it("plain test", noopTest);
	it("pending test");
	specify.only("focused test", noopTest);
	specify.skip("skipped test", noopTest);
	xdescribe("xdescribe suite", declareNestedSuite);
	xcontext("xcontext suite", declareNestedSuite);
	xit("xit test", noopTest);
	xspecify("xspecify test", noopTest);

	const beforeAllHooks = localRoot.getHooks(HookKind.BeforeAll);
	const afterAllHooks = localRoot.getHooks(HookKind.AfterAll);
	const beforeEachHooks = localRoot.getHooks(HookKind.BeforeEach);
	const afterEachHooks = localRoot.getHooks(HookKind.AfterEach);

	assert(beforeAllHooks.length == 1);
	assert(afterAllHooks.length == 1);
	assert(beforeEachHooks.length == 1);
	assert(afterEachHooks.length == 1);

	const children = localRoot.getChildren();
	assert(children.length == 10);

	assert(unchecked(children[0]).kind == NodeKind.Describe);
	assert(unchecked(children[0]).only);
	assert(unchecked(children[1]).kind == NodeKind.Describe);
	assert(unchecked(children[1]).declarationMode == DeclarationMode.Skip);
	assert(unchecked(children[2]).kind == NodeKind.Test);
	assert(unchecked(children[2]).declarationMode == DeclarationMode.Normal);
	assert(unchecked(children[3]).declarationMode == DeclarationMode.Todo);
	assert(unchecked(children[4]).only);
	assert(unchecked(children[5]).declarationMode == DeclarationMode.Skip);
	assert(unchecked(children[6]).declarationMode == DeclarationMode.Skip);
	assert(unchecked(children[7]).declarationMode == DeclarationMode.Skip);
	assert(unchecked(children[8]).declarationMode == DeclarationMode.Skip);
	assert(unchecked(children[9]).declarationMode == DeclarationMode.Skip);

	const focusedSuite = unchecked(children[0]);
	const focusedHooks = focusedSuite.getHooks(HookKind.BeforeEach);
	const focusedChildren = focusedSuite.getChildren();
	assert(focusedHooks.length == 1);
	assert(focusedChildren.length == 2);
	assert(unchecked(focusedChildren[0]).only);
	assert(unchecked(focusedChildren[1]).declarationMode == DeclarationMode.Todo);

	const skippedSuite = unchecked(children[1]);
	const skippedHooks = skippedSuite.getHooks(HookKind.BeforeEach);
	const skippedChildren = skippedSuite.getChildren();
	assert(skippedHooks.length == 1);
	assert(skippedChildren.length == 2);
	assert(unchecked(skippedChildren[0]).only);
	assert(unchecked(skippedChildren[1]).declarationMode == DeclarationMode.Todo);

	resetCurrentNode();
}

function testMochaAnonymousNames(): void {
	const localRoot = new Node(NodeKind.Root, "local root");
	setCurrentNode(localRoot);

	it("", noopTest);
	describe("", noopSuite);

	const children = localRoot.getChildren();
	assert(children.length == 2);
	assert(unchecked(children[0]).name == "<anonymous>");
	assert(unchecked(children[1]).name == "<anonymous>");

	resetCurrentNode();
}

testMochaDeclarationRegistration();
testMochaAnonymousNames();
