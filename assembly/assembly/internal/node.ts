import {
	DeclarationMode,
	FailurePolicyHint,
	HookKind,
	NodeKind,
	RunnerModeHint,
	SequenceMode,
} from "./imports";
import { getActiveRunOnly, setActiveRunOnly } from "./execution-state";
import {
	sharedSuiteContext,
	sharedTestContext,
	SuiteContext,
	TestContext,
} from "./context";
import { HookCallback, HookRegistration } from "./hooks";

export type NodeCallback = () => void;
export type TestNodeCallback = (context: TestContext) => void;
export type SuiteNodeCallback = (context: SuiteContext) => void;

function noop(): void {}

let nextStableNodeId: u32 = 1;
let nextDeclarationOrder: u32 = 0;

function allocateStableNodeId(): u32 {
	const nodeId = nextStableNodeId;
	nextStableNodeId += 1;
	return nodeId;
}

function allocateDeclarationOrder(): u32 {
	const declarationOrder = nextDeclarationOrder;
	nextDeclarationOrder += 1;
	return declarationOrder;
}

function createExecutionOptionsFromNode(source: Node): NodeExecutionOptions {
	const options = new NodeExecutionOptions();
	options.only = source.only;
	options.expectFailure = source.expectFailure;
	options.timeout = source.timeout;
	options.concurrency = source.concurrency;
	options.plan = source.plan;
	options.sequenceMode = source.sequenceMode;
	options.preferredRunnerMode = source.preferredRunnerMode;
	options.preferredFailurePolicy = source.preferredFailurePolicy;
	options.dependencyNodeIds = source.getDependencyNodeIds();
	return options;
}

function copyHookRegistrations(
	source: Array<HookRegistration>,
	destination: Array<HookRegistration>,
): void {
	destination.length = 0;
	for (let index: i32 = 0, length = source.length; index < length; index++) {
		destination.push(unchecked(source[index]));
	}
}

export class NodeExecutionOptions {
	only: bool = false;
	expectFailure: bool = false;
	timeout: i32 = -1;
	concurrency: i32 = 0;
	plan: i32 = -1;
	sequenceMode: SequenceMode = SequenceMode.Inherit;
	preferredRunnerMode: RunnerModeHint = RunnerModeHint.Default;
	preferredFailurePolicy: FailurePolicyHint = FailurePolicyHint.Inherit;
	dependencyNodeIds: Array<u32> = new Array<u32>();
}

/**
 * Structural node metadata plus the lazy child-discovery callback used to
 * rediscover descendants when traversal replays the node later.
 */
export class Node {
	readonly nodeId: u32;
	readonly declarationOrder: u32;
	readonly kind: NodeKind;
	readonly name: string;
	readonly callback: NodeCallback;
	readonly only: bool;
	readonly expectFailure: bool;
	readonly timeout: i32;
	readonly concurrency: i32;
	readonly plan: i32;
	readonly sequenceMode: SequenceMode;
	private preferredRunnerModeValue: RunnerModeHint;
	private preferredFailurePolicyValue: FailurePolicyHint;
	private readonly dependencyNodeIdsValue: Array<u32>;

	private readonly baseDeclarationModeValue: DeclarationMode;
	private declarationModeValue: DeclarationMode;
	private replayDeclarationModeValue: DeclarationMode;
	private parentValue: Node | null = null;
	private ordinalValue: u32 = 0;
	private slotSourceValue: Node | null = null;
	private childrenValue: Array<Node> = new Array<Node>();
	private childrenResolved: bool = false;
	private replayStateActive: bool = false;
	private replayShapeDrifted: bool = false;
	private replayChildrenValue: Array<Node> = new Array<Node>();
	private testCallbackValue: TestNodeCallback | null = null;
	private testCallbackContextValue: TestContext | null = null;
	private suiteCallbackValue: SuiteNodeCallback | null = null;
	private suiteCallbackContextValue: SuiteContext | null = null;
	private beforeAllHooks: Array<HookRegistration> =
		new Array<HookRegistration>();
	private beforeEachHooks: Array<HookRegistration> =
		new Array<HookRegistration>();
	private afterEachHooks: Array<HookRegistration> =
		new Array<HookRegistration>();
	private afterAllHooks: Array<HookRegistration> =
		new Array<HookRegistration>();
	private replayBeforeAllHooks: Array<HookRegistration> =
		new Array<HookRegistration>();
	private replayBeforeEachHooks: Array<HookRegistration> =
		new Array<HookRegistration>();
	private replayAfterEachHooks: Array<HookRegistration> =
		new Array<HookRegistration>();
	private replayAfterAllHooks: Array<HookRegistration> =
		new Array<HookRegistration>();

	constructor(
		kind: NodeKind,
		name: string,
		declarationMode: DeclarationMode = DeclarationMode.Normal,
		callback: NodeCallback | null = null,
		options: NodeExecutionOptions | null = null,
		stableNodeId: u32 = 0,
		declarationOrder: u32 = 0,
		reuseStableIdentity: bool = false,
	) {
		if (reuseStableIdentity) {
			this.nodeId = stableNodeId;
			this.declarationOrder = declarationOrder;
		} else if (kind == NodeKind.Root) {
			this.nodeId = 0;
			this.declarationOrder = 0;
		} else {
			this.nodeId = allocateStableNodeId();
			this.declarationOrder = allocateDeclarationOrder();
		}
		this.kind = kind;
		this.name = name;
		this.baseDeclarationModeValue = declarationMode;
		this.declarationModeValue = declarationMode;
		this.replayDeclarationModeValue = declarationMode;
		this.callback = callback !== null ? callback : noop;
		this.only = options !== null ? options.only : false;
		this.expectFailure = options !== null ? options.expectFailure : false;
		this.timeout = options !== null ? options.timeout : -1;
		this.concurrency = options !== null ? options.concurrency : 0;
		this.plan = options !== null ? options.plan : -1;
		this.sequenceMode =
			options !== null ? options.sequenceMode : SequenceMode.Inherit;
		this.preferredRunnerModeValue =
			options !== null ? options.preferredRunnerMode : RunnerModeHint.Default;
		this.preferredFailurePolicyValue =
			options !== null
				? options.preferredFailurePolicy
				: FailurePolicyHint.Inherit;
		this.dependencyNodeIdsValue = new Array<u32>();
		if (options !== null) {
			for (
				let index: i32 = 0, length = options.dependencyNodeIds.length;
				index < length;
				index++
			) {
				this.appendDependencyNodeId(
					unchecked(options.dependencyNodeIds[index]),
				);
			}
		}
	}

	get parent(): Node | null {
		return this.parentValue;
	}

	get preferredRunnerMode(): RunnerModeHint {
		return this.preferredRunnerModeValue;
	}

	get preferredFailurePolicy(): FailurePolicyHint {
		return this.preferredFailurePolicyValue;
	}

	getDeclarationSlotSource(): Node {
		return this.slotSourceValue !== null
			? changetype<Node>(this.slotSourceValue)
			: this;
	}

	get declarationMode(): DeclarationMode {
		if (this.replayStateActive) {
			return this.replayDeclarationModeValue;
		}

		return this.declarationModeValue;
	}

	hasResolvedChildren(): bool {
		return this.childrenResolved;
	}

	get ordinal(): u32 {
		return this.ordinalValue;
	}

	getDependencyNodeIds(): Array<u32> {
		const dependencyNodeIds = new Array<u32>();
		for (
			let index: i32 = 0, length = this.dependencyNodeIdsValue.length;
			index < length;
			index++
		) {
			dependencyNodeIds.push(unchecked(this.dependencyNodeIdsValue[index]));
		}

		return dependencyNodeIds;
	}

	/**
	 * Returns lazily discovered children, evaluating the node callback at most
	 * once to populate the child list.
	 */
	getChildren(): Array<Node> {
		if (this.childrenResolved) {
			return this.childrenValue;
		}

		this.invokeCallback();
		this.childrenResolved = true;

		return this.childrenValue;
	}

	rediscoverChildren(): Array<Node> {
		const slotSource = this.getDeclarationSlotSource();
		if (!slotSource.childrenResolved) {
			slotSource.getChildren();
			this.beginReplayState();
			this.copyReplayShapeFromSlotSource(slotSource);
			return this.replayChildrenValue;
		}

		this.beginReplayState();
		this.invokeCallback();
		return this.replayChildrenValue;
	}

	getReplayChildren(): Array<Node> {
		return this.replayChildrenValue;
	}

	hasActiveReplayState(): bool {
		return this.replayStateActive;
	}

	getReplayChildBufferLength(): i32 {
		return this.replayChildrenValue.length;
	}

	createChild(
		kind: NodeKind,
		name: string,
		declarationMode: DeclarationMode = DeclarationMode.Normal,
		callback: NodeCallback | null = null,
		options: NodeExecutionOptions | null = null,
	): Node {
		if (this.replayStateActive) {
			return this.createReplayChild(
				kind,
				name,
				declarationMode,
				callback,
				options,
			);
		}

		const child = new Node(kind, name, declarationMode, callback, options);
		child.parentValue = this;
		child.ordinalValue = <u32>this.childrenValue.length;
		this.childrenValue.push(child);
		return child;
	}

	setTestCallback(callback: TestNodeCallback): void {
		this.testCallbackValue = callback;
		this.suiteCallbackValue = null;
		this.suiteCallbackContextValue = null;
		if (this.slotSourceValue !== null) {
			const slotSource = changetype<Node>(this.slotSourceValue);
			slotSource.testCallbackValue = callback;
			slotSource.suiteCallbackValue = null;
			slotSource.suiteCallbackContextValue = null;
		}
	}

	setTestCallbackContext(context: TestContext): void {
		this.testCallbackContextValue = context;
		if (this.slotSourceValue !== null) {
			changetype<Node>(this.slotSourceValue).testCallbackContextValue = context;
		}
	}

	setSuiteCallback(callback: SuiteNodeCallback): void {
		this.suiteCallbackValue = callback;
		this.testCallbackValue = null;
		this.testCallbackContextValue = null;
		if (this.slotSourceValue !== null) {
			const slotSource = changetype<Node>(this.slotSourceValue);
			slotSource.suiteCallbackValue = callback;
			slotSource.testCallbackValue = null;
			slotSource.testCallbackContextValue = null;
		}
	}

	setSuiteCallbackContext(context: SuiteContext): void {
		this.suiteCallbackContextValue = context;
		if (this.slotSourceValue !== null) {
			changetype<Node>(this.slotSourceValue).suiteCallbackContextValue =
				context;
		}
	}

	setDeclarationMode(mode: DeclarationMode): void {
		if (this.replayStateActive) {
			this.replayDeclarationModeValue = mode;
			return;
		}

		this.declarationModeValue = mode;
	}

	setPreferredRunnerMode(mode: RunnerModeHint): void {
		if (this.replayStateActive) {
			this.preferredRunnerModeValue = mode;
			return;
		}

		this.preferredRunnerModeValue = mode;
		if (this.slotSourceValue !== null) {
			changetype<Node>(this.slotSourceValue).preferredRunnerModeValue = mode;
		}
	}

	setPreferredFailurePolicy(mode: FailurePolicyHint): void {
		if (this.replayStateActive) {
			this.preferredFailurePolicyValue = mode;
			return;
		}

		this.preferredFailurePolicyValue = mode;
		if (this.slotSourceValue !== null) {
			changetype<Node>(this.slotSourceValue).preferredFailurePolicyValue = mode;
		}
	}

	private beginReplayState(): void {
		this.replayStateActive = true;
		this.replayShapeDrifted = false;
		this.replayDeclarationModeValue = this.baseDeclarationModeValue;
		this.replayChildrenValue.length = 0;
		this.replayBeforeAllHooks.length = 0;
		this.replayBeforeEachHooks.length = 0;
		this.replayAfterEachHooks.length = 0;
		this.replayAfterAllHooks.length = 0;
	}

	clearReplayState(): void {
		this.replayStateActive = false;
		this.replayShapeDrifted = false;
		this.replayDeclarationModeValue = this.baseDeclarationModeValue;
		this.replayChildrenValue.length = 0;
		this.replayBeforeAllHooks.length = 0;
		this.replayBeforeEachHooks.length = 0;
		this.replayAfterEachHooks.length = 0;
		this.replayAfterAllHooks.length = 0;
	}

	resetUnresolvedDurableState(): void {
		if (this.childrenResolved) {
			return;
		}

		this.declarationModeValue = this.baseDeclarationModeValue;
		this.childrenValue.length = 0;
		this.beforeAllHooks.length = 0;
		this.beforeEachHooks.length = 0;
		this.afterEachHooks.length = 0;
		this.afterAllHooks.length = 0;
	}

	invokeCallback(): void {
		const previousNode = currentNode;
		const previousRunOnly = getActiveRunOnly();
		currentNode = this;
		if (this.suiteCallbackValue !== null) {
			this.suiteCallbackValue(
				this.suiteCallbackContextValue !== null
					? changetype<SuiteContext>(this.suiteCallbackContextValue)
					: sharedSuiteContext,
			);
		} else if (this.testCallbackValue !== null) {
			this.testCallbackValue(
				this.testCallbackContextValue !== null
					? changetype<TestContext>(this.testCallbackContextValue)
					: sharedTestContext,
			);
		} else {
			this.callback();
		}
		setActiveRunOnly(previousRunOnly);
		currentNode = previousNode;
	}

	hasReplayShapeDrift(): bool {
		if (!this.replayStateActive) {
			return false;
		}

		const slotSource = this.getDeclarationSlotSource();
		return (
			this.replayShapeDrifted ||
			this.replayChildrenValue.length != slotSource.childrenValue.length
		);
	}

	getNodeIndex(): StaticArray<u32> {
		let depth: i32 = 0;
		let cursor: Node | null = this;

		while (cursor !== null && cursor.parent !== null) {
			depth++;
			cursor = cursor.parent;
		}

		const nodeIndex = new StaticArray<u32>(depth);
		cursor = this;
		let index = depth - 1;

		while (cursor !== null && cursor.parent !== null) {
			unchecked((nodeIndex[index] = cursor.ordinal));
			cursor = cursor.parent;
			index--;
		}

		return nodeIndex;
	}

	registerHook(
		kind: HookKind,
		callback: HookCallback,
		timeout: i32 = -1,
		context: TestContext | null = null,
	): void {
		const registration = new HookRegistration(kind, callback, timeout, context);
		const beforeAllHooks = this.replayStateActive
			? this.replayBeforeAllHooks
			: this.beforeAllHooks;
		const beforeEachHooks = this.replayStateActive
			? this.replayBeforeEachHooks
			: this.beforeEachHooks;
		const afterEachHooks = this.replayStateActive
			? this.replayAfterEachHooks
			: this.afterEachHooks;
		const afterAllHooks = this.replayStateActive
			? this.replayAfterAllHooks
			: this.afterAllHooks;

		if (kind == HookKind.BeforeAll) {
			beforeAllHooks.push(registration);
			return;
		}

		if (kind == HookKind.BeforeEach) {
			beforeEachHooks.push(registration);
			return;
		}

		if (kind == HookKind.AfterEach) {
			afterEachHooks.push(registration);
			return;
		}

		afterAllHooks.push(registration);
	}

	registerDependency(node: Node): void {
		const dependencyNodeId = node.getDeclarationSlotSource().nodeId;
		if (dependencyNodeId == 0) {
			return;
		}

		this.appendDependencyNodeId(dependencyNodeId);
		if (this.slotSourceValue !== null) {
			changetype<Node>(this.slotSourceValue).appendDependencyNodeId(
				dependencyNodeId,
			);
		}
	}

	getHooks(kind: HookKind): Array<HookRegistration> {
		const beforeAllHooks = this.replayStateActive
			? this.replayBeforeAllHooks
			: this.beforeAllHooks;
		const beforeEachHooks = this.replayStateActive
			? this.replayBeforeEachHooks
			: this.beforeEachHooks;
		const afterEachHooks = this.replayStateActive
			? this.replayAfterEachHooks
			: this.afterEachHooks;
		const afterAllHooks = this.replayStateActive
			? this.replayAfterAllHooks
			: this.afterAllHooks;

		if (kind == HookKind.BeforeAll) {
			return beforeAllHooks;
		}

		if (kind == HookKind.BeforeEach) {
			return beforeEachHooks;
		}

		if (kind == HookKind.AfterEach) {
			return afterEachHooks;
		}

		return afterAllHooks;
	}

	private matchesDeclarationShape(
		kind: NodeKind,
		name: string,
		declarationMode: DeclarationMode,
		options: NodeExecutionOptions | null,
	): bool {
		const dependencyNodeIds =
			options !== null ? options.dependencyNodeIds : new Array<u32>();
		if (this.dependencyNodeIdsValue.length != dependencyNodeIds.length) {
			return false;
		}

		for (
			let index: i32 = 0, length = this.dependencyNodeIdsValue.length;
			index < length;
			index++
		) {
			if (
				unchecked(this.dependencyNodeIdsValue[index]) !=
				unchecked(dependencyNodeIds[index])
			) {
				return false;
			}
		}

		return (
			this.kind == kind &&
			this.name == name &&
			this.baseDeclarationModeValue == declarationMode &&
			this.only == (options !== null ? options.only : false) &&
			this.expectFailure ==
				(options !== null ? options.expectFailure : false) &&
			this.timeout == (options !== null ? options.timeout : -1) &&
			this.concurrency == (options !== null ? options.concurrency : 0) &&
			this.plan == (options !== null ? options.plan : -1) &&
			this.sequenceMode ==
				(options !== null ? options.sequenceMode : SequenceMode.Inherit) &&
			this.preferredRunnerMode ==
				(options !== null
					? options.preferredRunnerMode
					: RunnerModeHint.Default) &&
			this.preferredFailurePolicy ==
				(options !== null
					? options.preferredFailurePolicy
					: FailurePolicyHint.Inherit)
		);
	}

	private createReplayChildFromSlotSource(slotSource: Node): Node {
		const replayChild = new Node(
			slotSource.kind,
			slotSource.name,
			slotSource.baseDeclarationModeValue,
			null,
			createExecutionOptionsFromNode(slotSource),
			slotSource.nodeId,
			slotSource.declarationOrder,
			true,
		);
		replayChild.parentValue = this;
		replayChild.ordinalValue = slotSource.ordinal;
		replayChild.slotSourceValue = slotSource;
		replayChild.testCallbackValue = slotSource.testCallbackValue;
		replayChild.testCallbackContextValue = slotSource.testCallbackContextValue;
		replayChild.suiteCallbackValue = slotSource.suiteCallbackValue;
		replayChild.suiteCallbackContextValue =
			slotSource.suiteCallbackContextValue;
		return replayChild;
	}

	private copyReplayShapeFromSlotSource(slotSource: Node): void {
		copyHookRegistrations(slotSource.beforeAllHooks, this.replayBeforeAllHooks);
		copyHookRegistrations(
			slotSource.beforeEachHooks,
			this.replayBeforeEachHooks,
		);
		copyHookRegistrations(slotSource.afterEachHooks, this.replayAfterEachHooks);
		copyHookRegistrations(slotSource.afterAllHooks, this.replayAfterAllHooks);

		for (
			let index: i32 = 0, length = slotSource.childrenValue.length;
			index < length;
			index++
		) {
			const slotChild = unchecked(slotSource.childrenValue[index]);
			this.replayChildrenValue.push(
				this.createReplayChildFromSlotSource(slotChild),
			);
		}
	}

	private createReplayChild(
		kind: NodeKind,
		name: string,
		declarationMode: DeclarationMode,
		callback: NodeCallback | null = null,
		options: NodeExecutionOptions | null = null,
	): Node {
		const slotSource = this.getDeclarationSlotSource();
		const replaySlotIndex = this.replayChildrenValue.length;
		if (replaySlotIndex >= slotSource.childrenValue.length) {
			this.replayShapeDrifted = true;
			const extraReplayChild = new Node(
				kind,
				name,
				declarationMode,
				callback,
				options,
			);
			extraReplayChild.parentValue = this;
			extraReplayChild.ordinalValue = <u32>replaySlotIndex;
			this.replayChildrenValue.push(extraReplayChild);
			return extraReplayChild;
		}

		const slotChild = unchecked(slotSource.childrenValue[replaySlotIndex]);
		if (
			!slotChild.matchesDeclarationShape(kind, name, declarationMode, options)
		) {
			this.replayShapeDrifted = true;
		}

		const replayChild = this.createReplayChildFromSlotSource(slotChild);
		this.replayChildrenValue.push(replayChild);
		return replayChild;
	}

	private appendDependencyNodeId(nodeId: u32): void {
		for (
			let index: i32 = 0, length = this.dependencyNodeIdsValue.length;
			index < length;
			index++
		) {
			if (unchecked(this.dependencyNodeIdsValue[index]) == nodeId) {
				return;
			}
		}

		this.dependencyNodeIdsValue.push(nodeId);
	}
}

export const rootNode = new Node(NodeKind.Root, "~root");

export let currentNode: Node = rootNode;

export function setCurrentNode(node: Node): void {
	currentNode = node;
}

export function resetCurrentNode(): void {
	currentNode = rootNode;
}
