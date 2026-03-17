import { jsRuntime } from "./js";
import type { Runtime } from "./types";

export function assertSupportedRuntime(host: string | undefined) {
	if (host === undefined || host === "js" || host === "wazero") {
		return;
	}

	throw new Error(
		`Unsupported harness: ${host}. Supported harnesses: js, wazero.`,
	);
}

export async function resolveRuntime(
	host: string | undefined,
): Promise<Runtime> {
	assertSupportedRuntime(host);

	if (host === undefined || host === "js") {
		return jsRuntime;
	}

	if (host === "wazero") {
		try {
			const { wazeroRuntime } = await import("./wazero");
			return wazeroRuntime;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Harness 'wazero' is not available: ${message}`);
		}
	}
}
