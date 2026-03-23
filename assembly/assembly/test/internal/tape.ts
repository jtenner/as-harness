import { DeclarationMode, HookKind, NodeKind } from "../../internal/imports";
import { executeNode } from "../../internal/executor";
import { Node, resetCurrentNode, setCurrentNode } from "../../internal/node";
import test, { TestContext } from "../../tape";

function noop(_context: TestContext): void {}

function testTapeDeclarationRegistration(): void {
	const localRoot = new Node(NodeKind.Root, "local root");
	setCurrentNode(localRoot);

	test("plain test", noop);
	test.only("only test", noop);
	test.skip("skipped test", noop);

	const children = localRoot.getChildren();
	assert(children.length == 3);
	assert(unchecked(children[0]).declarationMode == DeclarationMode.Normal);
	assert(unchecked(children[1]).only);
	assert(unchecked(children[2]).declarationMode == DeclarationMode.Skip);

	resetCurrentNode();
}

function testTapeNestedDeclarations(): void {
	const localRoot = new Node(NodeKind.Root, "local root");
	setCurrentNode(localRoot);

	test("parent test", (context: TestContext): void => {
		context.comment("tape declaration diagnostic");
		context.plan(0);
		context.test("nested child", noop);
		context.test("second nested child", noop);
		context.end();
	});

	const children = localRoot.getChildren();
	assert(children.length == 1);

	const parent = unchecked(children[0]);
	const nestedChildren = parent.getChildren();
	assert(nestedChildren.length == 2);
	assert(unchecked(nestedChildren[0]).name == "nested child");
	assert(unchecked(nestedChildren[1]).name == "second nested child");

	resetCurrentNode();
}

function testTapeExecutionShell(): void {
	const localRoot = new Node(NodeKind.Root, "local root");
	const observed = new Array<string>();
	setCurrentNode(localRoot);

	test("execution shell", (context: TestContext): void => {
		context.plan(0);
		context.comment("tape execution diagnostic");
		context.teardown((teardownContext: TestContext): void => {
			observed.push(
				teardownContext.name +
					"|" +
					(teardownContext.passed ? "passed" : "pending") +
					"|" +
					teardownContext.attempt.toString(),
			);
		});
		context.end();
	});

	const children = localRoot.getChildren();
	assert(children.length == 1);
	assert(unchecked(children[0]).getHooks(HookKind.AfterAll).length == 0);
	assert(executeNode(unchecked(children[0])));
	assert.deepStrictEqual(observed, ["execution shell|passed|1"]);

	resetCurrentNode();
}

function testTapeAssertionSurface(): void {
	const localRoot = new Node(NodeKind.Root, "local root");
	setCurrentNode(localRoot);

	test("assertion surface", (context: TestContext): void => {
		context.plan(24);
		context.pass();
		context.ok<bool>(true);
		context.assert<bool>(true);
		context.true<bool>(true);
		context.notOk<i32>(0);
		context.false<i32>(0);
		context.notok<i32>(0);
		context.error<string | null>(null);
		context.ifError<string | null>(null);
		context.equal<i32>(11, 11);
		context.strictEqual<i32>(11, 11);
		context.is<i32>(11, 11);
		context.notEqual<i32>(11, 12);
		context.not<i32>(11, 12);
		context.looseEqual<string, i32>("11", 11);
		context.notLooseEqual<string, i32>("11", 12);
		context.deepEqual<Array<i32>>([1, 2], [1, 2]);
		context.same<Array<i32>>([1, 2], [1, 2]);
		context.notDeepEqual<Array<i32>>([1, 2], [1, 3]);
		context.notSame<Array<i32>>([1, 2], [1, 3]);
		context.throws((): void => {
			unreachable();
		});
		context.doesNotThrow((): void => {});
		context.skip("soft skip");
		context.end();
	});

	const children = localRoot.getChildren();
	assert(children.length == 1);
	assert(executeNode(unchecked(children[0])));

	resetCurrentNode();
}

testTapeDeclarationRegistration();
testTapeNestedDeclarations();
testTapeExecutionShell();
testTapeAssertionSurface();
