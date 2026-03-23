import {
	AssertionFailureRecord,
	clearActiveErrorMessage,
	getActiveAssertionFailureRecord,
	getActiveFailureKind,
	getActiveErrorPointer,
	restoreActiveFailureState,
	setActiveAssertionFailureRecord,
	setActiveFailureKind,
	setActiveErrorMessage,
	stageActiveAssertionFailure,
	takeActiveFailureStateSnapshot,
} from "../../internal/failure-state";
import { FailureKind } from "../../internal/imports";

function testFailureStateStoresPointersForMessages(): void {
	clearActiveErrorMessage();
	assert(getActiveErrorPointer() == 0);

	const message = "failure";
	setActiveErrorMessage(message);
	assert(getActiveErrorPointer() == changetype<usize>(message));

	clearActiveErrorMessage();
	assert(getActiveErrorPointer() == 0);
}

function testFailureStateStoresStructuredAssertionRecords(): void {
	clearActiveErrorMessage();

	stageActiveAssertionFailure(
		"uvu assert mismatch",
		"equal",
		"[1, 2]",
		"[1, 3]",
		"expected deep equality",
		true,
	);

	assert(getActiveFailureKind() == <u8>FailureKind.Assertion);
	assert(getActiveErrorPointer() == changetype<usize>("uvu assert mismatch"));

	const record = getActiveAssertionFailureRecord();
	assert(record !== null);
	assert(
		changetype<AssertionFailureRecord>(record).message == "uvu assert mismatch",
	);
	assert(changetype<AssertionFailureRecord>(record).operator == "equal");
	assert(changetype<AssertionFailureRecord>(record).actual == "[1, 2]");
	assert(changetype<AssertionFailureRecord>(record).expects == "[1, 3]");
	assert(
		changetype<AssertionFailureRecord>(record).details ==
			"expected deep equality",
	);
	assert(changetype<AssertionFailureRecord>(record).generated);

	changetype<AssertionFailureRecord>(record).message = "mutated";
	const preserved = getActiveAssertionFailureRecord();
	assert(preserved !== null);
	assert(
		changetype<AssertionFailureRecord>(preserved).message ==
			"uvu assert mismatch",
	);

	clearActiveErrorMessage();
	assert(getActiveAssertionFailureRecord() === null);
}

function testFailureStateSnapshotsRestoreStructuredAssertionRecords(): void {
	clearActiveErrorMessage();
	setActiveErrorMessage("plain message");
	setActiveFailureKind(<u8>FailureKind.Trap);

	const plainSnapshot = takeActiveFailureStateSnapshot();

	stageActiveAssertionFailure(
		"nested assertion",
		"throws",
		"did not throw",
		"expected trap",
	);

	const assertionSnapshot = takeActiveFailureStateSnapshot();
	clearActiveErrorMessage();
	restoreActiveFailureState(assertionSnapshot);

	const assertionRecord = getActiveAssertionFailureRecord();
	assert(assertionRecord !== null);
	assert(
		changetype<AssertionFailureRecord>(assertionRecord).message ==
			"nested assertion",
	);
	assert(
		changetype<AssertionFailureRecord>(assertionRecord).operator == "throws",
	);
	assert(getActiveFailureKind() == <u8>FailureKind.Assertion);

	restoreActiveFailureState(plainSnapshot);
	assert(getActiveFailureKind() == <u8>FailureKind.Trap);
	assert(getActiveAssertionFailureRecord() === null);
	assert(getActiveErrorPointer() == changetype<usize>("plain message"));
}

function testSettingPlainFailureStateClearsStructuredAssertionRecords(): void {
	clearActiveErrorMessage();
	setActiveAssertionFailureRecord(
		new AssertionFailureRecord("structured", "detail", true, "ok", "0", "1"),
	);
	setActiveFailureKind(<u8>FailureKind.Assertion);
	assert(getActiveAssertionFailureRecord() !== null);

	setActiveErrorMessage("plain");
	assert(getActiveAssertionFailureRecord() === null);

	setActiveAssertionFailureRecord(
		new AssertionFailureRecord("structured", null, false, "ok", "0", "1"),
	);
	setActiveFailureKind(<u8>FailureKind.Assertion);
	setActiveFailureKind(<u8>FailureKind.Trap);
	assert(getActiveAssertionFailureRecord() === null);
}

testFailureStateStoresPointersForMessages();
testFailureStateStoresStructuredAssertionRecords();
testFailureStateSnapshotsRestoreStructuredAssertionRecords();
testSettingPlainFailureStateClearsStructuredAssertionRecords();
