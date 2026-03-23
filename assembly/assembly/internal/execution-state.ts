import { HookKind } from "./imports";
import { clearActiveErrorMessage } from "./failure-state";
import { failAssertion } from "./assert-bridge";

type NodeIndex = StaticArray<u32>;

let assertionScopeActive: bool = false;
let plannedAssertionCount: i32 = -1;
let observedAssertionCount: i32 = 0;
let activeNodeName = "";
let activeExecutionTargetTestName = "";
let activeExecutionTargetSuiteName = "";
let activeAttempt: i32 = 0;
let activeNodePassed: bool = false;
let activeRunOnly: bool = false;
let activeHookKind: u32 = 0;
let activeNodeIndex: NodeIndex | null = null;
let activeTraversalTarget: NodeIndex | null = null;

function cloneNodeIndex(nodeIndex: NodeIndex | null): NodeIndex | null {
	if (nodeIndex === null) {
		return null;
	}

	const copy = new StaticArray<u32>(nodeIndex.length);
	for (let index = 0, length = nodeIndex.length; index < length; index++) {
		unchecked((copy[index] = unchecked(nodeIndex[index])));
	}

	return copy;
}

function resetAssertionScopeState(): void {
	assertionScopeActive = false;
	plannedAssertionCount = -1;
	observedAssertionCount = 0;
	activeNodeName = "";
	activeExecutionTargetTestName = "";
	activeExecutionTargetSuiteName = "";
	activeAttempt = 0;
	activeNodePassed = false;
	activeRunOnly = false;
	clearActiveErrorMessage();
}

function planMismatchMessage(): string {
	return (
		'node:test plan mismatch in "' +
		activeNodeName +
		'": expected ' +
		plannedAssertionCount.toString() +
		" assertion(s), saw " +
		observedAssertionCount.toString()
	);
}

export function beginAssertionScope(
	nodeName: string,
	initialPlannedAssertionCount: i32 = -1,
): void {
	assertionScopeActive = true;
	plannedAssertionCount = initialPlannedAssertionCount;
	observedAssertionCount = 0;
	activeNodeName = nodeName;
	activeAttempt = 1;
	activeNodePassed = false;
	activeRunOnly = false;
	clearActiveErrorMessage();
}

export function endAssertionScope(): void {
	if (!assertionScopeActive) {
		return;
	}

	if (
		plannedAssertionCount >= 0 &&
		observedAssertionCount != plannedAssertionCount
	) {
		failAssertion(planMismatchMessage());
	}

	resetAssertionScopeState();
}

export function abandonAssertionScope(): void {
	resetAssertionScopeState();
}

export function recordAssertionCall(): void {
	if (!assertionScopeActive) {
		return;
	}

	observedAssertionCount++;

	if (
		plannedAssertionCount >= 0 &&
		observedAssertionCount > plannedAssertionCount
	) {
		failAssertion(planMismatchMessage());
	}
}

export function setPlannedAssertionCount(count: i32): void {
	if (!assertionScopeActive) {
		return;
	}

	plannedAssertionCount = count;

	if (
		plannedAssertionCount >= 0 &&
		observedAssertionCount > plannedAssertionCount
	) {
		failAssertion(planMismatchMessage());
	}
}

export function markActiveNodeCallbackPassed(): void {
	if (!assertionScopeActive) {
		return;
	}

	activeNodePassed = true;
}

export function setActiveExecutionTargetCrumbs(
	testName: string,
	suiteName: string,
): void {
	activeExecutionTargetTestName = testName;
	activeExecutionTargetSuiteName = suiteName;
}

export function getActiveExecutionTargetName(): string {
	return activeExecutionTargetTestName;
}

export function getActiveExecutionTargetSuiteName(): string {
	return activeExecutionTargetSuiteName;
}

export function getPlannedAssertionCount(): i32 {
	return plannedAssertionCount;
}

export function getObservedAssertionCount(): i32 {
	return observedAssertionCount;
}

export function getActiveAttempt(): i32 {
	return activeAttempt;
}

export function getActiveNodePassed(): bool {
	return activeNodePassed;
}

export function setActiveHookPhase(kind: HookKind): void {
	activeHookKind = <u32>kind;
}

export function clearActiveHookPhase(): void {
	activeHookKind = 0;
}

export function getActiveHookPhase(): u32 {
	return activeHookKind;
}

export function setActiveNodeIndex(nodeIndex: NodeIndex | null): void {
	activeNodeIndex = cloneNodeIndex(nodeIndex);
}

export function clearActiveNodeIndex(): void {
	activeNodeIndex = null;
}

export function hasActiveNodeIndex(): bool {
	return activeNodeIndex !== null;
}

export function getActiveNodeIndexLength(): i32 {
	const nodeIndex = activeNodeIndex;
	if (nodeIndex === null) {
		return -1;
	}

	return nodeIndex.length;
}

export function getActiveNodeIndexElement(index: i32): u32 {
	const nodeIndex = activeNodeIndex;
	if (nodeIndex === null) {
		return 0;
	}

	return unchecked(nodeIndex[index]);
}

export function setActiveTraversalTarget(nodeIndex: NodeIndex | null): void {
	activeTraversalTarget = cloneNodeIndex(nodeIndex);
}

export function clearActiveTraversalTarget(): void {
	activeTraversalTarget = null;
}

export function hasActiveTraversalTarget(): bool {
	return activeTraversalTarget !== null;
}

export function getActiveTraversalTargetLength(): i32 {
	const nodeIndex = activeTraversalTarget;
	if (nodeIndex === null) {
		return -1;
	}

	return nodeIndex.length;
}

export function getActiveTraversalTargetElement(index: i32): u32 {
	const nodeIndex = activeTraversalTarget;
	if (nodeIndex === null) {
		return 0;
	}

	return unchecked(nodeIndex[index]);
}

export function setActiveRunOnly(shouldRunOnlyTests: bool): void {
	activeRunOnly = shouldRunOnlyTests;
}

export function getActiveRunOnly(): bool {
	return activeRunOnly;
}
