/// <reference types="node" />

import type {
	HarnessCoverageFileOverview,
	HarnessCoverageJSONFile,
	HarnessCoverageJSONReport,
	HarnessCoveragePoint,
	HarnessCoveragePointEntry,
	HarnessCoveragePointType,
	HarnessCoverageSnapshot,
} from "./covers-types";

export type {
	HarnessCoverageFileOverview,
	HarnessCoverageJSONFile,
	HarnessCoverageJSONReport,
	HarnessCoveragePoint,
	HarnessCoveragePointEntry,
	HarnessCoveragePointType,
	HarnessCoverageSnapshot,
};

export type HarnessBytes = Buffer | ArrayBufferView | ArrayBuffer;

export interface HarnessNode {
	nodeIndex: Array<number>;
	nodeId: number;
	parentNodeId: number;
	declarationOrder: number;
	sequenceMode: number;
	preferredRunnerMode: number;
	preferredFailurePolicy: number;
	dependencyNodeIds: Array<number>;
	only: boolean;
	expectFailure: boolean;
	kind: number;
	declarationMode: number;
	name: string;
}

export interface HarnessRunMetadata {
	ok: boolean;
	discoveryOk: boolean;
	planningOk: boolean;
	discoveredTestCount: number;
	topLevelNodes: Array<HarnessNode>;
	/**
	 * Number of same-machine execution slots actually used for ready work.
	 */
	workerCount: number;
	planIssues: Array<HarnessPlanIssue>;
	blocked: Array<HarnessBlockedNode>;
	coverage: HarnessCoverageSnapshot | null;
}

export type HarnessNodeFoundEvent = HarnessNode;

export interface HarnessNodeEvent {
	nodeIndex: Array<number>;
	nodeId: number;
}

export interface HarnessCallbackEvent {
	hook: number;
	nodeIndex: Array<number>;
	nodeId: number;
}

export interface HarnessFailureEvent {
	nodeIndex: Array<number>;
	nodeId: number;
	failureKind: number;
}

export interface HarnessCallbackFailureEvent {
	hook: number;
	nodeIndex: Array<number>;
	nodeId: number;
	failureKind: number;
}

export interface HarnessFailMessageEvent {
	message: string;
}

export interface HarnessDiagnosticEvent {
	nodeIndex: Array<number>;
	message: string;
}

export interface HarnessLogEvent {
	message: string;
	source: "trace";
	values: Array<number>;
}

export interface HarnessEventMap {
	nodeFound: HarnessNodeFoundEvent;
	nodeStart: HarnessNodeEvent;
	nodePass: HarnessNodeEvent;
	nodeFail: HarnessFailureEvent;
	failMessage: HarnessFailMessageEvent;
	callbackStart: HarnessCallbackEvent;
	callbackPass: HarnessCallbackEvent;
	callbackFail: HarnessCallbackFailureEvent;
	diagnostic: HarnessDiagnosticEvent;
	log: HarnessLogEvent;
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

export type HarnessIssueType =
	| "missing-dependency"
	| "blocked-dependency"
	| "dependency-cycle"
	| "ignored-hint"
	| (string & {});

export interface HarnessPlanIssue {
	type: HarnessIssueType;
	issueLabel: string;
	targetIdentityKey: string;
	dependencyIdentityKey: string;
	hintName?: string;
	hintValue?: number;
}

export interface HarnessBlockedNode {
	node: HarnessNode;
	issueType: HarnessIssueType;
	issueLabel: string;
	dependencyIdentityKey: string;
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
	metadata: HarnessRunMetadata;
	ok: boolean;
	discoveryOk: boolean;
	planningOk: boolean;
	discoveredTestCount: number;
	topLevelNodes: Array<HarnessNode>;
	/**
	 * Number of same-machine execution slots actually used for ready work.
	 */
	workerCount: number;
	branches: Array<HarnessBranch>;
	planIssues: Array<HarnessPlanIssue>;
	blocked: Array<HarnessBlockedNode>;
	coverage: HarnessCoverageSnapshot | null;
}

export interface Harness {
	onNodeFound(callback: HarnessEventCallback<"nodeFound">): void;
	onNodeStart(callback: HarnessEventCallback<"nodeStart">): void;
	onNodePass(callback: HarnessEventCallback<"nodePass">): void;
	onNodeFail(callback: HarnessEventCallback<"nodeFail">): void;
	onFailMessage(callback: HarnessEventCallback<"failMessage">): void;
	onCallbackStart(callback: HarnessEventCallback<"callbackStart">): void;
	onCallbackPass(callback: HarnessEventCallback<"callbackPass">): void;
	onCallbackFail(callback: HarnessEventCallback<"callbackFail">): void;
	onDiagnostic(callback: HarnessEventCallback<"diagnostic">): void;
	onLog(callback: HarnessEventCallback<"log">): void;
	callI32(exportName: string): number;
	discover(nodeIndex: Array<number>): boolean;
	run(nodeIndex: Array<number>): boolean;
	start(): Promise<HarnessStartResult>;
	getCoverageSnapshot(): HarnessCoverageSnapshot | null;
	resetCoverage(): void;
	close(): void;
}
