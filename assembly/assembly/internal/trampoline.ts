import { invokeStaged } from "./imports";

export type TrapCallback = () => void;

let stagedTrapCallback: TrapCallback | null = null;

/**
 * Returns `true` when the callback trapped across the host-managed boundary.
 *
 * The callback slot is always cleared before this function returns, regardless
 * of whether the staged callback completed or trapped.
 */
export function didCallbackTrap(callback: TrapCallback): bool {
  if (stagedTrapCallback !== null) {
    unreachable();
  }

  stagedTrapCallback = callback;
  const status = invokeStaged();
  stagedTrapCallback = null;
  return status == 0;
}

/**
 * Exported host-callable trampoline that invokes the currently staged
 * callback. The host owns trap observation around this call.
 */
export function invoke(): void {
  const callback = stagedTrapCallback;
  if (callback === null) {
    unreachable();
  }

  callback();
}
