import { DeclarationMode, HookKind, NodeKind, SequenceMode } from "./imports";
import {
	currentNode,
	Node,
	NodeExecutionOptions,
	SuiteNodeCallback,
	TestNodeCallback,
} from "./node";
import { HookCallback } from "./hooks";

const DEFAULT_NAME = "<anonymous>";

export class NodeDeclarationOptions {
	mode: DeclarationMode = DeclarationMode.Normal;
	only: bool = false;
	expectFailure: bool = false;
	timeout: i32 = -1;
	concurrency: i32 = 0;
	plan: i32 = -1;
	sequenceMode: SequenceMode = SequenceMode.Inherit;
}

export class TestDeclarationHandle {
	private readonly node: Node;

	constructor(node: Node) {
		this.node = node.getDeclarationSlotSource();
	}

	dependsOn(
		dependency: TestDeclarationHandle | null = null,
	): TestDeclarationHandle {
		if (dependency === null) {
			return this;
		}

		this.node.registerDependency(dependency.node);
		return this;
	}
}

function normalizeNodeName(name: string): string {
	return name.length > 0 ? name : DEFAULT_NAME;
}

function createExecutionOptions(
	options: NodeDeclarationOptions | null,
): NodeExecutionOptions | null {
	if (options === null) {
		return null;
	}

	const executionOptions = new NodeExecutionOptions();
	executionOptions.only = options.only;
	executionOptions.expectFailure = options.expectFailure;
	executionOptions.timeout = options.timeout;
	executionOptions.concurrency = options.concurrency;
	executionOptions.plan = options.plan;
	executionOptions.sequenceMode = options.sequenceMode;
	return executionOptions;
}

export function declareTestNode(
	name: string = "",
	callback: TestNodeCallback | null = null,
	options: NodeDeclarationOptions | null = null,
): Node {
	const child = currentNode.createChild(
		NodeKind.Test,
		normalizeNodeName(name),
		options !== null ? options.mode : DeclarationMode.Normal,
		null,
		createExecutionOptions(options),
	);

	if (callback !== null) {
		child.setTestCallback(callback);
	}

	return child;
}

export function declareSuiteNode(
	name: string = "",
	callback: SuiteNodeCallback | null = null,
	options: NodeDeclarationOptions | null = null,
): Node {
	const child = currentNode.createChild(
		NodeKind.Describe,
		normalizeNodeName(name),
		options !== null ? options.mode : DeclarationMode.Normal,
		null,
		createExecutionOptions(options),
	);

	if (callback !== null) {
		child.setSuiteCallback(callback);
	}

	return child;
}

export function registerHook(
	kind: HookKind,
	callback: HookCallback | null = null,
	timeout: i32 = -1,
): void {
	if (callback === null) {
		return;
	}

	currentNode.registerHook(kind, callback, timeout);
}
