import {
	clearActiveErrorMessage,
	getActiveErrorPointer,
	setActiveErrorMessage,
} from "../../internal/failure-state";

function testFailureStateStoresPointersForMessages(): void {
	clearActiveErrorMessage();
	assert(getActiveErrorPointer() == 0);

	const message = "failure";
	setActiveErrorMessage(message);
	assert(getActiveErrorPointer() == changetype<usize>(message));

	clearActiveErrorMessage();
	assert(getActiveErrorPointer() == 0);
}

testFailureStateStoresPointersForMessages();
