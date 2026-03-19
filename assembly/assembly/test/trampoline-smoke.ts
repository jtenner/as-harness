import { didCallbackTrap } from "../internal/trampoline";

export { invoke } from "../internal/trampoline";

function returnsNormally(): void {}

function trapsUnreachable(): void {
	unreachable();
}

function nestedCallbackReturns(): void {
	didCallbackTrap(returnsNormally);
}

function nestedCallbackTraps(): void {
	didCallbackTrap(trapsUnreachable);
}

export function didTrapWhenCallbackReturns(): i32 {
	return didCallbackTrap(returnsNormally) ? 1 : 0;
}

export function didTrapWhenCallbackTraps(): i32 {
	return didCallbackTrap(trapsUnreachable) ? 1 : 0;
}

export function didTrapWhenNestedCallbackReturns(): i32 {
	return didCallbackTrap(nestedCallbackReturns) ? 1 : 0;
}

export function didTrapWhenNestedCallbackTraps(): i32 {
	return didCallbackTrap(nestedCallbackTraps) ? 1 : 0;
}
