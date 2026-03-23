import { DeclarationMode, HookKind, NodeKind } from "../../internal/imports";
import { executeNode } from "../../internal/executor";
import { Node, resetCurrentNode, setCurrentNode } from "../../internal/node";
import QUnit from "../../qunit";
import { Assert, ModuleFn, NestedHooks, TestFn } from "../../qunit";
import { module as qunitModule, test as qunitTest } from "../../qunit";

function noopTest(_assert: Assert): void {}

function noopModule(_hooks: NestedHooks): void {}

function noopHook(_assert: Assert): void {}

function testQUnitRootRegistration(): void {
	const localRoot = new Node(NodeKind.Root, "local root");
	setCurrentNode(localRoot);

	QUnit.hooks.beforeEach(noopHook);
	QUnit.hooks.afterEach(noopHook);
	QUnit.test("plain test", noopTest);
	QUnit.only("only alias", noopTest);
	QUnit.skip("skipped alias");
	QUnit.todo("todo placeholder");
	qunitTest.todo("todo execution", noopTest);

	assert(localRoot.getHooks(HookKind.BeforeEach).length == 1);
	assert(localRoot.getHooks(HookKind.AfterEach).length == 1);

	const children = localRoot.getChildren();
	assert(children.length == 5);
	assert(unchecked(children[0]).name == "plain test");
	assert(unchecked(children[1]).only);
	assert(unchecked(children[2]).declarationMode == DeclarationMode.Skip);
	assert(unchecked(children[3]).declarationMode == DeclarationMode.Todo);
	assert(unchecked(children[4]).expectFailure);

	resetCurrentNode();
}

function testQUnitModuleRegistration(): void {
	const localRoot = new Node(NodeKind.Root, "local root");
	setCurrentNode(localRoot);

	QUnit.module("plain module", (hooks: NestedHooks): void => {
		hooks.before(noopHook);
		hooks.after(noopHook);
		hooks.beforeEach(noopHook);
		hooks.afterEach(noopHook);
		QUnit.test("module child", noopTest);
	});

	qunitModule.only("only module", (_hooks: NestedHooks): void => {
		QUnit.test("only child", noopTest);
	});

	qunitModule.skip("skipped module", (_hooks: NestedHooks): void => {
		QUnit.test("skipped child", noopTest);
	});

	qunitModule.todo("todo module", (_hooks: NestedHooks): void => {
		QUnit.test("todo child", noopTest);
		QUnit.module("nested todo module", (_nestedHooks: NestedHooks): void => {
			QUnit.test("nested todo child", noopTest);
		});
	});

	const children = localRoot.getChildren();
	assert(children.length == 4);

	const plainModule = unchecked(children[0]);
	assert(plainModule.getHooks(HookKind.BeforeAll).length == 1);
	assert(plainModule.getHooks(HookKind.AfterAll).length == 1);
	assert(plainModule.getHooks(HookKind.BeforeEach).length == 1);
	assert(plainModule.getHooks(HookKind.AfterEach).length == 1);
	assert(unchecked(plainModule.getChildren()[0]).name == "module child");

	const onlyModule = unchecked(children[1]);
	assert(onlyModule.only);
	assert(unchecked(onlyModule.getChildren()[0]).only);

	const skippedModule = unchecked(children[2]);
	assert(skippedModule.declarationMode == DeclarationMode.Skip);
	assert(
		unchecked(skippedModule.getChildren()[0]).declarationMode ==
			DeclarationMode.Skip,
	);

	const todoModule = unchecked(children[3]);
	const todoChildren = todoModule.getChildren();
	assert(todoChildren.length == 2);
	assert(unchecked(todoChildren[0]).expectFailure);
	const nestedTodoModule = unchecked(todoChildren[1]);
	assert(unchecked(nestedTodoModule.getChildren()[0]).expectFailure);

	resetCurrentNode();
}

function testQUnitExecutionShell(): void {
	const localRoot = new Node(NodeKind.Root, "local root");
	const observed = new Array<string>();
	setCurrentNode(localRoot);

	QUnit.hooks.beforeEach((_assert: Assert): void => {
		observed.push("root beforeEach");
	});
	QUnit.hooks.afterEach((_assert: Assert): void => {
		observed.push("root afterEach");
	});

	QUnit.module("execution module", (hooks: NestedHooks): void => {
		hooks.before((_assert: Assert): void => {
			observed.push("before");
		});
		hooks.after((_assert: Assert): void => {
			observed.push("after");
		});
		hooks.beforeEach((_assert: Assert): void => {
			observed.push("module beforeEach");
		});
		hooks.afterEach((_assert: Assert): void => {
			observed.push("module afterEach");
		});
		QUnit.test("child", (_assert: Assert): void => {
			observed.push("test");
		});
	});

	const children = localRoot.getChildren();
	assert(children.length == 1);
	assert(executeNode(unchecked(children[0])));
	assert.deepStrictEqual(observed, [
		"before",
		"root beforeEach",
		"module beforeEach",
		"test",
		"module afterEach",
		"root afterEach",
		"after",
	]);

	resetCurrentNode();
}

function testQUnitAssertionSurface(): void {
	const localRoot = new Node(NodeKind.Root, "local root");
	setCurrentNode(localRoot);

	QUnit.test("assertion surface", (assert: Assert): void => {
		assert.expect(14);
		assert.ok<bool>(true);
		assert.notOk<i32>(0);
		assert.true<bool>(true);
		assert.false<bool>(false);
		assert.equal<string, i32>("11", 11);
		assert.notEqual<string, i32>("11", 12);
		assert.strictEqual<i32>(21, 21);
		assert.notStrictEqual<i32>(21, 22);
		assert.deepEqual<Array<i32>>([1, 2], [1, 2]);
		assert.notDeepEqual<Array<i32>>([1, 2], [1, 3]);
		assert.step("first");
		assert.step("second");
		assert.verifySteps(["first", "second"]);
		assert.throws((): void => {
			unreachable();
		});
	});

	const children = localRoot.getChildren();
	assert(children.length == 1);
	assert(executeNode(unchecked(children[0])));

	resetCurrentNode();
}

testQUnitRootRegistration();
testQUnitModuleRegistration();
testQUnitExecutionShell();
testQUnitAssertionSurface();
