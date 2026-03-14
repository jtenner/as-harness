import { didCallbackTrap } from "../internal/trampoline";

export { invoke } from "../internal/trampoline";

function returnsNormally(): void {}

function trapsUnreachable(): void {
  unreachable();
}

export function didTrapWhenCallbackReturns(): i32 {
  return didCallbackTrap(returnsNormally) ? 1 : 0;
}

export function didTrapWhenCallbackTraps(): i32 {
  return didCallbackTrap(trapsUnreachable) ? 1 : 0;
}
