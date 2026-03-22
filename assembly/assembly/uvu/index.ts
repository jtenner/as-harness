import { currentNode, Node, setCurrentNode } from "../internal/node";
import {
	DeclarationMode,
	FailurePolicyHint,
	HookKind,
	RunnerModeHint,
} from "../internal/imports";
import {
	declareHook,
	declareModifiedSuite,
	declareModifiedTest,
	declareTest,
} from "./parse";
import { HookFn, TestFn } from "./types";

export * from "./types";

function declareTestOnNode(
	node: Node,
	name: string = "",
	callback: TestFn | null = null,
): void {
	const previousNode = currentNode;
	setCurrentNode(node);
	declareTest(name, callback);
	setCurrentNode(previousNode);
}

function declareModifiedTestOnNode(
	node: Node,
	name: string = "",
	callback: TestFn | null = null,
	mode: DeclarationMode = DeclarationMode.Normal,
	only: bool = false,
): void {
	const previousNode = currentNode;
	setCurrentNode(node);
	declareModifiedTest(name, callback, mode, only);
	setCurrentNode(previousNode);
}

function declareHookOnNode(
	node: Node,
	kind: HookKind,
	callback: HookFn | null = null,
): void {
	const previousNode = currentNode;
	setCurrentNode(node);
	declareHook(kind, callback);
	setCurrentNode(previousNode);
}

function getRootDeclarationNode(node: Node): Node {
	let cursor = node.getDeclarationSlotSource();
	while (cursor.parent !== null) {
		cursor = changetype<Node>(cursor.parent);
	}

	return cursor;
}

function setRunnerModeHint(node: Node, shouldRunInBand: bool = true): void {
	node.setPreferredRunnerMode(
		shouldRunInBand ? RunnerModeHint.InBand : RunnerModeHint.Default,
	);
}

function setFailurePolicyHint(node: Node, hint: FailurePolicyHint): void {
	node.setPreferredFailurePolicy(hint);
}

export class UvuSuite<T = usize> {
	private readonly node: Node;
	readonly context: T;

	constructor(node: Node, context: T = changetype<T>(0)) {
		this.node = node.getDeclarationSlotSource();
		this.context = context;
	}

	get name(): string {
		return this.node.name;
	}

	test(name: string = "", callback: TestFn | null = null): void {
		declareTestOnNode(this.node, name, callback);
	}

	only(name: string = "", callback: TestFn | null = null): void {
		declareModifiedTestOnNode(
			this.node,
			name,
			callback,
			DeclarationMode.Normal,
			true,
		);
	}

	skip(name: string = "", callback: TestFn | null = null): void {
		declareModifiedTestOnNode(this.node, name, callback, DeclarationMode.Skip);
	}

	inBand(shouldRunInBand: bool = true): void {
		setRunnerModeHint(this.node, shouldRunInBand);
	}

	bail(shouldBail: bool = true): void {
		setFailurePolicyHint(
			this.node,
			shouldBail ? FailurePolicyHint.Bail : FailurePolicyHint.Inherit,
		);
	}

	continueOnFailure(shouldContinue: bool = true): void {
		setFailurePolicyHint(
			this.node,
			shouldContinue ? FailurePolicyHint.Continue : FailurePolicyHint.Inherit,
		);
	}

	before(callback: HookFn | null = null): void {
		declareHookOnNode(this.node, HookKind.BeforeAll, callback);
	}

	after(callback: HookFn | null = null): void {
		declareHookOnNode(this.node, HookKind.AfterAll, callback);
	}

	beforeEach(callback: HookFn | null = null): void {
		declareHookOnNode(this.node, HookKind.BeforeEach, callback);
	}

	afterEach(callback: HookFn | null = null): void {
		declareHookOnNode(this.node, HookKind.AfterEach, callback);
	}

	run(): void {}
}

export function suite<T = usize>(
	name: string = "",
	context: T = changetype<T>(0),
): UvuSuite<T> {
	return new UvuSuite<T>(declareModifiedSuite(name, null), context);
}

export function test(name: string = "", callback: TestFn | null = null): void {
	declareTest(name, callback);
}

export namespace test {
	export function only(
		name: string = "",
		callback: TestFn | null = null,
	): void {
		declareModifiedTest(name, callback, DeclarationMode.Normal, true);
	}

	export function skip(
		name: string = "",
		callback: TestFn | null = null,
	): void {
		declareModifiedTest(name, callback, DeclarationMode.Skip);
	}

	export function inBand(shouldRunInBand: bool = true): void {
		setRunnerModeHint(getRootDeclarationNode(currentNode), shouldRunInBand);
	}

	export function bail(shouldBail: bool = true): void {
		setFailurePolicyHint(
			getRootDeclarationNode(currentNode),
			shouldBail ? FailurePolicyHint.Bail : FailurePolicyHint.Inherit,
		);
	}

	export function continueOnFailure(shouldContinue: bool = true): void {
		setFailurePolicyHint(
			getRootDeclarationNode(currentNode),
			shouldContinue ? FailurePolicyHint.Continue : FailurePolicyHint.Inherit,
		);
	}

	export function before(callback: HookFn | null = null): void {
		declareHook(HookKind.BeforeAll, callback);
	}

	export namespace before {
		export function each(callback: HookFn | null = null): void {
			declareHook(HookKind.BeforeEach, callback);
		}
	}

	export function after(callback: HookFn | null = null): void {
		declareHook(HookKind.AfterAll, callback);
	}

	export namespace after {
		export function each(callback: HookFn | null = null): void {
			declareHook(HookKind.AfterEach, callback);
		}
	}

	export function run(): void {}
}

export function exec(bail: bool = false): void {
	test.bail(bail);
}
