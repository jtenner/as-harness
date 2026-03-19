import { invokeStaged } from "./imports";

export type TrapCallback = () => void;

const stagedTrapCallbacks = new Array<TrapCallback>();

/**
 * Returns `true` when the callback trapped across the host-managed boundary.
 *
 * Nested trap observation is supported so assertion helpers such as
 * `throws(...)` can be used from within already-running test callbacks.
 */
export function didCallbackTrap(callback: TrapCallback): bool {
	stagedTrapCallbacks.push(callback);
	const status = invokeStaged();
	stagedTrapCallbacks.pop();
	return status == 0;
}

/**
 * Exported host-callable trampoline that invokes the currently staged
 * callback. The host owns trap observation around this call.
 */
export function invoke(): void {
	const depth = stagedTrapCallbacks.length;
	if (depth == 0) {
		unreachable();
	}

	const callback = unchecked(stagedTrapCallbacks[depth - 1]);
	callback();
}
