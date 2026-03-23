import {
	DeclarationMode,
	HookKind,
	NodeKind,
	SequenceMode,
} from "../../internal/imports";
import { Node, resetCurrentNode, setCurrentNode } from "../../internal/node";
import test from "../../ava";
import { ExecutionContext } from "../../ava";

function noop(_context: ExecutionContext): void {}

function testAvaDeclarationRegistration(): void {
	const localRoot = new Node(NodeKind.Root, "local root");
	setCurrentNode(localRoot);

	test.before(noop);
	test.before.skip(noop);
	test.beforeEach(noop);
	test.after(noop);
	test.after.always(noop);
	test.afterEach(noop);
	test.afterEach.always(noop);

	test("plain test", noop);
	test.only("only test", noop);
	test.skip("skipped test", noop);
	test.todo("todo test");
	test.failing("failing test", noop);
	test.failing.only("focused failing test", noop);
	test.failing.skip("skipped failing test", noop);
	test.serial("serial test", noop);
	test.serial.only("serial only test", noop);
	test.serial.skip("serial skipped test", noop);
	test.serial.todo("serial todo test");
	test.serial.failing("serial failing test", noop);

	const beforeAllHooks = localRoot.getHooks(HookKind.BeforeAll);
	const beforeEachHooks = localRoot.getHooks(HookKind.BeforeEach);
	const afterEachHooks = localRoot.getHooks(HookKind.AfterEach);
	const afterAllHooks = localRoot.getHooks(HookKind.AfterAll);

	assert(beforeAllHooks.length == 1);
	assert(beforeEachHooks.length == 1);
	assert(afterEachHooks.length == 2);
	assert(afterAllHooks.length == 2);

	const children = localRoot.getChildren();
	assert(children.length == 12);

	assert(unchecked(children[0]).declarationMode == DeclarationMode.Normal);
	assert(unchecked(children[1]).only);
	assert(unchecked(children[2]).declarationMode == DeclarationMode.Skip);
	assert(unchecked(children[3]).declarationMode == DeclarationMode.Todo);
	assert(unchecked(children[4]).expectFailure);
	assert(unchecked(children[5]).expectFailure && unchecked(children[5]).only);
	assert(
		unchecked(children[6]).expectFailure &&
			unchecked(children[6]).declarationMode == DeclarationMode.Skip,
	);
	assert(unchecked(children[7]).sequenceMode == SequenceMode.Sequential);
	assert(
		unchecked(children[8]).sequenceMode == SequenceMode.Sequential &&
			unchecked(children[8]).only,
	);
	assert(
		unchecked(children[9]).sequenceMode == SequenceMode.Sequential &&
			unchecked(children[9]).declarationMode == DeclarationMode.Skip,
	);
	assert(
		unchecked(children[10]).sequenceMode == SequenceMode.Sequential &&
			unchecked(children[10]).declarationMode == DeclarationMode.Todo,
	);
	assert(
		unchecked(children[11]).sequenceMode == SequenceMode.Sequential &&
			unchecked(children[11]).expectFailure,
	);

	resetCurrentNode();
}

testAvaDeclarationRegistration();
