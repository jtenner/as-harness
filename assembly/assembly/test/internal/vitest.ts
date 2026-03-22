import {
	DeclarationMode,
	HookKind,
	NodeKind,
	SequenceMode,
} from "../../internal/imports";
import { Node, resetCurrentNode, setCurrentNode } from "../../internal/node";
import {
	afterAll,
	afterEach,
	assertType,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	ModuleContext,
	SuiteContext,
	suite,
	test,
	TestContext,
} from "../../vitest";

function noopSuite(_context: SuiteContext): void {}

function noopTest(_context: TestContext): void {}

function noopHook(_context: TestContext): void {}

function noopModuleHook(_context: ModuleContext): void {}

function declareNestedSuite(_context: SuiteContext): void {
	assertType<i32>(1);
	test.fails("nested xfail", noopTest);
	it.only("nested only", noopTest);
}

function testVitestDeclarationRegistration(): void {
	const localRoot = new Node(NodeKind.Root, "local root");
	setCurrentNode(localRoot);

	beforeAll(noopModuleHook);
	afterAll(noopModuleHook);
	beforeEach(noopHook);
	afterEach(noopHook);

	test("plain test", noopTest);
	test("implicit todo");
	test.fails("xfail test", noopTest);
	test.sequential("sequential test", noopTest);
	test.skipIf(true)("skipIf test", noopTest);
	test.runIf(false)("runIf test", noopTest);
	it.sequential("sequential it", noopTest);
	test.concurrent("concurrent test", noopTest);
	it.concurrent("concurrent it", noopTest);
	describe.only("focused suite", declareNestedSuite);
	describe.sequential("sequential suite", noopSuite);
	suite.sequential("sequential suite alias", noopSuite);
	describe.concurrent("concurrent suite", noopSuite);
	suite.concurrent("concurrent suite alias", noopSuite);
	describe.skipIf(true)("skipped suite", noopSuite);
	suite.runIf(false)("runIf suite", noopSuite);
	suite.todo("todo suite", noopSuite);

	assert(expect<i32>(1).not !== null);

	const beforeAllHooks = localRoot.getHooks(HookKind.BeforeAll);
	const afterAllHooks = localRoot.getHooks(HookKind.AfterAll);
	const beforeEachHooks = localRoot.getHooks(HookKind.BeforeEach);
	const afterEachHooks = localRoot.getHooks(HookKind.AfterEach);

	assert(beforeAllHooks.length == 1);
	assert(afterAllHooks.length == 1);
	assert(beforeEachHooks.length == 1);
	assert(afterEachHooks.length == 1);

	const children = localRoot.getChildren();
	assert(children.length == 17);

	assert(unchecked(children[0]).kind == NodeKind.Test);
	assert(unchecked(children[0]).declarationMode == DeclarationMode.Normal);
	assert(unchecked(children[1]).declarationMode == DeclarationMode.Todo);
	assert(unchecked(children[2]).expectFailure);
	assert(unchecked(children[3]).declarationMode == DeclarationMode.Normal);
	assert(unchecked(children[3]).sequenceMode == SequenceMode.Sequential);
	assert(unchecked(children[4]).declarationMode == DeclarationMode.Skip);
	assert(unchecked(children[5]).declarationMode == DeclarationMode.Skip);
	assert(unchecked(children[6]).declarationMode == DeclarationMode.Normal);
	assert(unchecked(children[6]).sequenceMode == SequenceMode.Sequential);
	assert(unchecked(children[7]).declarationMode == DeclarationMode.Normal);
	assert(unchecked(children[7]).sequenceMode == SequenceMode.Inherit);
	assert(unchecked(children[8]).declarationMode == DeclarationMode.Normal);
	assert(unchecked(children[8]).sequenceMode == SequenceMode.Inherit);
	assert(unchecked(children[9]).only);
	assert(unchecked(children[10]).declarationMode == DeclarationMode.Normal);
	assert(unchecked(children[10]).sequenceMode == SequenceMode.Sequential);
	assert(unchecked(children[11]).declarationMode == DeclarationMode.Normal);
	assert(unchecked(children[11]).sequenceMode == SequenceMode.Sequential);
	assert(unchecked(children[12]).declarationMode == DeclarationMode.Normal);
	assert(unchecked(children[12]).sequenceMode == SequenceMode.Inherit);
	assert(unchecked(children[13]).declarationMode == DeclarationMode.Normal);
	assert(unchecked(children[13]).sequenceMode == SequenceMode.Inherit);
	assert(unchecked(children[14]).declarationMode == DeclarationMode.Skip);
	assert(unchecked(children[15]).declarationMode == DeclarationMode.Skip);
	assert(unchecked(children[16]).declarationMode == DeclarationMode.Todo);

	const focusedSuite = unchecked(children[9]);
	const nestedChildren = focusedSuite.getChildren();
	assert(nestedChildren.length == 2);
	assert(unchecked(nestedChildren[0]).expectFailure);
	assert(unchecked(nestedChildren[1]).only);

	resetCurrentNode();
}

function testVitestAnonymousNames(): void {
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

function testVitestExpectMatchers(): void {
	const haystack = [1, 2, 3];

	assertType<i32>(1);
	expect<i32>(2).toBe(2);
	expect<i32>(2).not.toBe(3);
	expect<Array<i32>>(haystack).toContain(2);
	expect<Array<i32>>(haystack).toHaveLength(3);
	expect<f64>(NaN).toBeNaN();
}

testVitestDeclarationRegistration();
testVitestAnonymousNames();
testVitestExpectMatchers();
