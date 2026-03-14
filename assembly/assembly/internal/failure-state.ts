let activeErrorMessage: string | null = null;

export function clearActiveErrorMessage(): void {
  activeErrorMessage = null;
}

export function setActiveErrorMessage(message: string | null): void {
  activeErrorMessage = message;
}

export function getActiveErrorPointer(): usize {
  return activeErrorMessage !== null ? changetype<usize>(activeErrorMessage) : 0;
}
