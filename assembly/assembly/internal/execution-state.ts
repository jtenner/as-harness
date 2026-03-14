import { clearActiveErrorMessage } from "./failure-state";
import { failAssertion } from "./assert-bridge";

let assertionScopeActive: bool = false;
let plannedAssertionCount: i32 = -1;
let observedAssertionCount: i32 = 0;
let activeNodeName = "";
let activeAttempt: i32 = 0;
let activeNodePassed: bool = false;
let activeRunOnly: bool = false;

function resetAssertionScopeState(): void {
  assertionScopeActive = false;
  plannedAssertionCount = -1;
  observedAssertionCount = 0;
  activeNodeName = "";
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

export function setActiveRunOnly(shouldRunOnlyTests: bool): void {
  activeRunOnly = shouldRunOnlyTests;
}

export function getActiveRunOnly(): bool {
  return activeRunOnly;
}
