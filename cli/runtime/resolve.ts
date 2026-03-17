import { jsRuntime } from "./js";
import type { Runtime } from "./types";

export async function resolveRuntime(
	host: string | undefined,
): Promise<Runtime> {
	if (host === undefined || host === "js") {
		return jsRuntime;
	}

	if (host === "wazero") {
		try {
			const { wazeroRuntime } = await import("./wazero");
			return wazeroRuntime;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Host 'wazero' is not available: ${message}`);
		}
	}

	throw new Error(`Unsupported host: ${host}. Supported hosts: js, wazero.`);
}
