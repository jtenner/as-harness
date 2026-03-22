import { DeclarationMode, HookKind, NodeKind } from "../../internal/imports";
import { Node, resetCurrentNode, setCurrentNode } from "../../internal/node";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	fail,
	fdescribe,
	fit,
	it,
	SuiteContext,
	TestContext,
	xdescribe,
	xit,
} from "../../jasmine";

function noopSuite(_context: SuiteContext): void {}

function noopTest(_context: TestContext): void {}

function noopHook(_context: TestContext): void {}

function failImmediately(): void {
	fail("jasmine fail");
}

function declareNestedSuite(_context: SuiteContext): void {
	beforeEach(noopHook);
	fit("nested focused spec", noopTest);
	it("nested pending spec");
}

function testJasmineDeclarationRegistration(): void {
	const localRoot = new Node(NodeKind.Root, "local root");
	setCurrentNode(localRoot);

	beforeAll(noopHook);
	afterAll(noopHook);
	beforeEach(noopHook);
	afterEach(noopHook);

	describe("plain suite", declareNestedSuite);
	fdescribe("focused suite", noopSuite);
	xdescribe("skipped suite", noopSuite);
	it("plain spec", noopTest);
	it("pending spec");
	fit("focused spec", noopTest);
	xit("skipped spec", noopTest);

	const beforeAllHooks = localRoot.getHooks(HookKind.BeforeAll);
	const afterAllHooks = localRoot.getHooks(HookKind.AfterAll);
	const beforeEachHooks = localRoot.getHooks(HookKind.BeforeEach);
	const afterEachHooks = localRoot.getHooks(HookKind.AfterEach);

	assert(beforeAllHooks.length == 1);
	assert(afterAllHooks.length == 1);
	assert(beforeEachHooks.length == 1);
	assert(afterEachHooks.length == 1);

	const children = localRoot.getChildren();
	assert(children.length == 7);

	assert(unchecked(children[0]).kind == NodeKind.Describe);
	assert(unchecked(children[0]).declarationMode == DeclarationMode.Normal);
	assert(unchecked(children[1]).kind == NodeKind.Describe);
	assert(unchecked(children[1]).only);
	assert(unchecked(children[2]).declarationMode == DeclarationMode.Skip);
	assert(unchecked(children[3]).kind == NodeKind.Test);
	assert(unchecked(children[3]).declarationMode == DeclarationMode.Normal);
	assert(unchecked(children[4]).declarationMode == DeclarationMode.Todo);
	assert(unchecked(children[5]).only);
	assert(unchecked(children[6]).declarationMode == DeclarationMode.Skip);

	const plainSuite = unchecked(children[0]);
	const nestedHooks = plainSuite.getHooks(HookKind.BeforeEach);
	const nestedChildren = plainSuite.getChildren();
	assert(nestedHooks.length == 1);
	assert(nestedChildren.length == 2);
	assert(unchecked(nestedChildren[0]).only);
	assert(unchecked(nestedChildren[1]).declarationMode == DeclarationMode.Todo);

	resetCurrentNode();
}

function testJasmineAnonymousNames(): void {
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

function testJasmineMatchers(): void {
	const numbers = [1, 2, 3];
	const maybeNothing = <string | null>null;

	expect<i32>(2).toBe(2);
	expect<i32>(2).not.toBe(3);
	expect<Array<i32>>(numbers).toEqual([1, 2, 3]);
	expect<Array<i32>>(numbers).not.toEqual([1, 2, 4]);
	expect<bool>(true).toBeTruthy();
	expect<bool>(false).toBeFalsy();
	expect<string | null>("value").toBeDefined();
	expect<string | null>(maybeNothing).toBeNull();
	expect<string | null>(maybeNothing).toBeUndefined();
	expect<Array<i32>>(numbers).toContain(2);
	expect<Array<i32>>(numbers).not.toContain(5);
	expect<i32>(5).toBeGreaterThan(4);
	expect<i32>(4).toBeLessThan(5);
	expect<f64>(NaN).toBeNaN();
	expect<() => void>(failImmediately).toThrow();
	expect<() => void>((): void => {}).not.toThrow();
}

testJasmineDeclarationRegistration();
testJasmineAnonymousNames();
testJasmineMatchers();
