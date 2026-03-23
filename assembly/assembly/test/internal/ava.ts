import {
	DeclarationMode,
	HookKind,
	NodeKind,
	SequenceMode,
} from "../../internal/imports";
import { executeNode } from "../../internal/executor";
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

function testAvaExecutionContext(): void {
	const localRoot = new Node(NodeKind.Root, "local root");
	const observed = new Array<string>();
	setCurrentNode(localRoot);

	test.before((context: ExecutionContext): void => {
		context.context.set("trace", "before|" + context.title);
	});

	test.beforeEach((context: ExecutionContext): void => {
		const trace = context.context.get("trace");
		context.context.set("trace", trace + ">beforeEach|" + context.title);
		context.truthy<string>(trace);
	});

	test.afterEach((context: ExecutionContext): void => {
		const trace = context.context.get("trace");
		context.context.set("trace", trace + ">afterEach|" + context.title);
	});

	test.after((context: ExecutionContext): void => {
		const trace = context.context.get("trace");
		observed.push(trace + ">after|" + context.title);
	});

	test("first test", (context: ExecutionContext): void => {
		const trace = context.context.get("trace");
		context.context.set("trace", trace + ">test|" + context.title);
		context.log("first ava diagnostic");
		context.pass();
		context.assert<bool>(true);
		context.truthy<string>("value");
		context.falsy<string | null>(null);
		context.true(true);
		context.false(false);
		context.is<string>(context.title, "first test");
		context.not<i32>(11, 12);
		context.deepEqual<Array<i32>>([1, 2], [1, 2]);
		context.notDeepEqual<Array<i32>>([1, 2], [1, 3]);
		context.like<Array<i32>, Array<i32>>([1, 2, 3], [1, 2]);
		context.throws((): void => {
			unreachable();
		});
		context.notThrows((): void => {});
	});

	test("second test", (context: ExecutionContext): void => {
		const trace = context.context.get("trace");
		context.context.set("trace", trace + ">test|" + context.title);
		context.is<string>(context.title, "second test");
		context.true(context.context.isSet);
	});

	const children = localRoot.getChildren();
	assert(children.length == 2);
	assert(executeNode(unchecked(children[0])));
	assert(executeNode(unchecked(children[1])));
	assert.deepStrictEqual(observed, [
		"before|first test>beforeEach|first test>test|first test>afterEach|first test>after|first test",
		"before|second test>beforeEach|second test>test|second test>afterEach|second test>after|second test",
	]);

	resetCurrentNode();
}

function testAvaMacroDeclarationsAndExecution(): void {
	const localRoot = new Node(NodeKind.Root, "local root");
	const observed = new Array<string>();
	setCurrentNode(localRoot);

	const titledMacro = test.macro<string>(
		(context: ExecutionContext, values: Array<string>): void => {
			observed.push("macro|" + context.title + "|" + values.join(","));
			context.is<string>(values.join(","), "alpha,beta");
		},
		(providedTitle: string, values: Array<string>): string => {
			return "  " + providedTitle + "   " + values.join("   ") + "  ";
		},
	);

	const generatedMacro = test.macro<string>(
		(context: ExecutionContext, values: Array<string>): void => {
			observed.push("generated|" + context.title + "|" + values.join(","));
		},
		(_providedTitle: string, values: Array<string>): string => {
			return "   generated   " + values.join("   ");
		},
	);

	const failingMacro = test.macro<string>(
		(context: ExecutionContext, values: Array<string>): void => {
			context.is<string>(values.join(","), "unexpected");
		},
		(providedTitle: string, values: Array<string>): string => {
			return providedTitle + " " + values.join(" ");
		},
	);

	test.useNamed("macro title", titledMacro, "alpha", "beta");
	test.only.useNamed("macro only", titledMacro, "focus");
	test.skip.useNamed("macro skip", titledMacro, "skip");
	test.failing.useNamed("macro failing", failingMacro, "fail");
	test.serial.use(generatedMacro, "serial", "macro");

	const children = localRoot.getChildren();
	assert(children.length == 5);
	assert(unchecked(children[0]).name == "macro title alpha beta");
	assert(unchecked(children[1]).name == "macro only focus");
	assert(unchecked(children[1]).only);
	assert(unchecked(children[2]).name == "macro skip skip");
	assert(unchecked(children[2]).declarationMode == DeclarationMode.Skip);
	assert(unchecked(children[3]).name == "macro failing fail");
	assert(unchecked(children[3]).expectFailure);
	assert(unchecked(children[4]).name == "generated serial macro");
	assert(unchecked(children[4]).sequenceMode == SequenceMode.Sequential);

	assert(executeNode(unchecked(children[0])));
	assert(executeNode(unchecked(children[4])));
	assert.deepStrictEqual(observed, [
		"macro|macro title alpha beta|alpha,beta",
		"generated|generated serial macro|serial,macro",
	]);

	resetCurrentNode();
}

testAvaDeclarationRegistration();
testAvaExecutionContext();
testAvaMacroDeclarationsAndExecution();
