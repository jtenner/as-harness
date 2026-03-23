import { DeclarationMode, HookKind, NodeKind } from "../../internal/imports";
import { executeNode } from "../../internal/executor";
import { Node, resetCurrentNode, setCurrentNode } from "../../internal/node";
import tap, {
	after,
	afterEach,
	before,
	beforeEach,
	only,
	skip,
	test,
	todo,
	Test,
} from "../../tap";

function noop(_context: Test): void {}

function rootHook(_context: Test): void {}

function testTapRootRegistration(): void {
	const localRoot = new Node(NodeKind.Root, "local root");
	setCurrentNode(localRoot);

	before(rootHook);
	after(rootHook);
	beforeEach(rootHook);
	afterEach(rootHook);
	test("plain test", noop);
	skip("skipped test", noop);
	todo("todo test", noop);
	only("only test", noop);

	assert(localRoot.getHooks(HookKind.BeforeAll).length == 1);
	assert(localRoot.getHooks(HookKind.AfterAll).length == 1);
	assert(localRoot.getHooks(HookKind.BeforeEach).length == 1);
	assert(localRoot.getHooks(HookKind.AfterEach).length == 1);

	const children = localRoot.getChildren();
	assert(children.length == 4);
	assert(unchecked(children[0]).declarationMode == DeclarationMode.Normal);
	assert(unchecked(children[1]).declarationMode == DeclarationMode.Skip);
	assert(unchecked(children[2]).declarationMode == DeclarationMode.Todo);
	assert(unchecked(children[3]).only);

	resetCurrentNode();
}

function testTapDefaultExportRegistration(): void {
	const localRoot = new Node(NodeKind.Root, "local root");
	setCurrentNode(localRoot);

	tap.before(rootHook);
	tap.after(rootHook);
	tap.beforeEach(rootHook);
	tap.afterEach(rootHook);
	tap.test("default plain", noop);
	tap.skip("default skipped", noop);
	tap.todo("default todo", noop);
	tap.only("default only", noop);

	assert(localRoot.getHooks(HookKind.BeforeAll).length == 1);
	assert(localRoot.getHooks(HookKind.AfterAll).length == 1);
	assert(localRoot.getHooks(HookKind.BeforeEach).length == 1);
	assert(localRoot.getHooks(HookKind.AfterEach).length == 1);

	const children = localRoot.getChildren();
	assert(children.length == 4);
	assert(unchecked(children[0]).name == "default plain");
	assert(unchecked(children[1]).declarationMode == DeclarationMode.Skip);
	assert(unchecked(children[2]).declarationMode == DeclarationMode.Todo);
	assert(unchecked(children[3]).only);

	resetCurrentNode();
}

function testTapNestedRegistration(): void {
	const localRoot = new Node(NodeKind.Root, "local root");
	setCurrentNode(localRoot);

	test("parent test", (context: Test): void => {
		assert(context.name == "parent test");
		assert(context.fullname == "parent test");
		assert(!context.passed);
		assert(context.attempt == 0);
		context.before(rootHook);
		context.after(rootHook);
		context.beforeEach(rootHook);
		context.afterEach(rootHook);
		context.teardown(rootHook);
		context.test("nested child", noop);
		context.skip("nested skipped", noop);
		context.todo("nested todo", noop);
		context.only("nested only", noop);
	});

	const children = localRoot.getChildren();
	assert(children.length == 1);

	const parent = unchecked(children[0]);
	assert(parent.getHooks(HookKind.BeforeAll).length == 2);
	assert(parent.getHooks(HookKind.AfterAll).length == 2);
	assert(parent.getHooks(HookKind.BeforeEach).length == 1);
	assert(parent.getHooks(HookKind.AfterEach).length == 1);

	const nestedChildren = parent.getChildren();
	assert(nestedChildren.length == 4);
	assert(unchecked(nestedChildren[0]).name == "nested child");
	assert(unchecked(nestedChildren[1]).declarationMode == DeclarationMode.Skip);
	assert(unchecked(nestedChildren[2]).declarationMode == DeclarationMode.Todo);
	assert(unchecked(nestedChildren[3]).only);

	resetCurrentNode();
}

function testTapExecutionShell(): void {
	const localRoot = new Node(NodeKind.Root, "local root");
	const observed = new Array<string>();
	setCurrentNode(localRoot);

	test("execution shell", (context: Test): void => {
		context.before((_hookContext: Test): void => {
			observed.push("before");
		});
		context.after((hookContext: Test): void => {
			observed.push(
				hookContext.name +
					"|" +
					(hookContext.passed ? "passed" : "pending") +
					"|" +
					hookContext.attempt.toString(),
			);
		});
		context.test("nested child", (_child: Test): void => {
			observed.push("nested");
		});
	});

	const children = localRoot.getChildren();
	assert(children.length == 1);
	assert(executeNode(unchecked(children[0])));
	assert.deepStrictEqual(observed, [
		"before",
		"nested",
		"execution shell|passed|1",
	]);

	resetCurrentNode();
}

testTapRootRegistration();
testTapDefaultExportRegistration();
testTapNestedRegistration();
testTapExecutionShell();
