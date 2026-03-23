import { FailureKind } from "./imports";

let activeErrorMessage: string | null = null;
let activeFailureKind: u8 = 0;
let activeAssertionFailureRecord: AssertionFailureRecord | null = null;

@final
export class AssertionFailureRecord {
	message: string | null;
	details: string | null;
	generated: bool;
	operator: string | null;
	actual: string | null;
	expects: string | null;

	constructor(
		message: string | null = null,
		details: string | null = null,
		generated: bool = false,
		operator: string | null = null,
		actual: string | null = null,
		expects: string | null = null,
	) {
		this.message = message;
		this.details = details;
		this.generated = generated;
		this.operator = operator;
		this.actual = actual;
		this.expects = expects;
	}
}

@final
export class FailureStateSnapshot {
	errorMessage: string | null;
	failureKind: u8;
	assertionFailureRecord: AssertionFailureRecord | null;

	constructor(
		errorMessage: string | null = null,
		failureKind: u8 = 0,
		assertionFailureRecord: AssertionFailureRecord | null = null,
	) {
		this.errorMessage = errorMessage;
		this.failureKind = failureKind;
		this.assertionFailureRecord =
			assertionFailureRecord === null
				? null
				: cloneAssertionFailureRecord(assertionFailureRecord);
	}
}

function cloneAssertionFailureRecord(
	record: AssertionFailureRecord | null,
): AssertionFailureRecord | null {
	if (record === null) {
		return null;
	}

	return new AssertionFailureRecord(
		record.message,
		record.details,
		record.generated,
		record.operator,
		record.actual,
		record.expects,
	);
}

export function clearActiveErrorMessage(): void {
	activeErrorMessage = null;
	activeFailureKind = 0;
	activeAssertionFailureRecord = null;
}

export function setActiveErrorMessage(message: string | null): void {
	activeErrorMessage = message;
	activeAssertionFailureRecord = null;
}

export function setActiveFailureKind(kind: u8): void {
	activeFailureKind = kind;
	if (kind != <u8>FailureKind.Assertion) {
		activeAssertionFailureRecord = null;
	}
}

export function getActiveFailureKind(): u8 {
	return activeFailureKind;
}

export function getActiveErrorPointer(): usize {
	return activeErrorMessage !== null
		? changetype<usize>(activeErrorMessage)
		: 0;
}

export function setActiveAssertionFailureRecord(
	record: AssertionFailureRecord | null,
): void {
	activeAssertionFailureRecord = cloneAssertionFailureRecord(record);
}

export function getActiveAssertionFailureRecord(): AssertionFailureRecord | null {
	return cloneAssertionFailureRecord(activeAssertionFailureRecord);
}

export function stageActiveAssertionFailure(
	message: string | null,
	operator: string | null = null,
	actual: string | null = null,
	expects: string | null = null,
	details: string | null = null,
	generated: bool = false,
): void {
	activeErrorMessage = message;
	activeFailureKind = <u8>FailureKind.Assertion;
	activeAssertionFailureRecord = new AssertionFailureRecord(
		message,
		details,
		generated,
		operator,
		actual,
		expects,
	);
}

export function takeActiveFailureStateSnapshot(): FailureStateSnapshot {
	return new FailureStateSnapshot(
		activeErrorMessage,
		activeFailureKind,
		activeAssertionFailureRecord,
	);
}

export function restoreActiveFailureState(
	snapshot: FailureStateSnapshot,
): void {
	activeErrorMessage = snapshot.errorMessage;
	activeFailureKind = snapshot.failureKind;
	activeAssertionFailureRecord = cloneAssertionFailureRecord(
		snapshot.assertionFailureRecord,
	);
}
