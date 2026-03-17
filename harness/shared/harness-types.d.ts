/// <reference types="node" />

export type HarnessBytes = Buffer | ArrayBufferView | ArrayBuffer;

export interface HarnessNode {
	nodeIndex: Array<number>;
	kind: number;
	declarationMode: number;
	name: string;
}

export type HarnessNodeFoundEvent = HarnessNode;

export interface HarnessNodeEvent {
	nodeIndex: Array<number>;
}

export interface HarnessCallbackEvent {
	hook: number;
	nodeIndex: Array<number>;
}

export interface HarnessFailMessageEvent {
	message: string;
}

export interface HarnessDiagnosticEvent {
	nodeIndex: Array<number>;
	message: string;
}

export interface HarnessEventMap {
	nodeFound: HarnessNodeFoundEvent;
	nodeStart: HarnessNodeEvent;
	nodePass: HarnessNodeEvent;
	failMessage: HarnessFailMessageEvent;
	callbackStart: HarnessCallbackEvent;
	callbackPass: HarnessCallbackEvent;
	diagnostic: HarnessDiagnosticEvent;
}

export type HarnessEventType = keyof HarnessEventMap;

export type HarnessEvent<T extends HarnessEventType = HarnessEventType> = {
	type: T;
	data: HarnessEventMap[T];
};

export type HarnessEventCallback<T extends HarnessEventType> = (
	event: HarnessEventMap[T],
) => void;

export interface HarnessExecution {
	node: HarnessNode;
	ok: boolean;
	events: Array<HarnessEvent>;
}

export interface HarnessBranchDiscovery {
	ok: boolean;
	nodes: Array<HarnessNode>;
	testCount: number;
}

export interface HarnessBranch {
	root: HarnessNode;
	discovery: HarnessBranchDiscovery;
	executions: Array<HarnessExecution>;
	ok: boolean;
}

export interface HarnessStartResult {
	ok: boolean;
	discoveryOk: boolean;
	discoveredTestCount: number;
	topLevelNodes: Array<HarnessNode>;
	workerCount: number;
	branches: Array<HarnessBranch>;
}

export interface Harness {
	onNodeFound(callback: HarnessEventCallback<"nodeFound">): void;
	onNodeStart(callback: HarnessEventCallback<"nodeStart">): void;
	onNodePass(callback: HarnessEventCallback<"nodePass">): void;
	onFailMessage(callback: HarnessEventCallback<"failMessage">): void;
	onCallbackStart(callback: HarnessEventCallback<"callbackStart">): void;
	onCallbackPass(callback: HarnessEventCallback<"callbackPass">): void;
	onDiagnostic(callback: HarnessEventCallback<"diagnostic">): void;
	callI32(exportName: string): number;
	discover(nodeIndex: Array<number>): boolean;
	run(nodeIndex: Array<number>): boolean;
	start(): Promise<HarnessStartResult>;
	close(): void;
}
