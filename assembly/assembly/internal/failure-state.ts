let activeErrorMessage: string | null = null;
let activeFailureKind: u8 = 0;

export function clearActiveErrorMessage(): void {
	activeErrorMessage = null;
	activeFailureKind = 0;
}

export function setActiveErrorMessage(message: string | null): void {
	activeErrorMessage = message;
}

export function setActiveFailureKind(kind: u8): void {
	activeFailureKind = kind;
}

export function getActiveFailureKind(): u8 {
	return activeFailureKind;
}

export function getActiveErrorPointer(): usize {
	return activeErrorMessage !== null
		? changetype<usize>(activeErrorMessage)
		: 0;
}
