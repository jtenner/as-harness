import { createRequire } from "node:module";
import type { Harness } from "../../harness/shared/harness-types";
import { setCompilerOptionValue, type Runtime } from "./types";

type WasmtimeHarnessModule = {
	createHarness(bytes: Uint8Array): Harness;
};

const sourceRequire = createRequire(import.meta.url);
let cachedHarnessModule: WasmtimeHarnessModule | null = null;

function resolveWasmtimeHarnessModule() {
	if (cachedHarnessModule !== null) {
		return cachedHarnessModule;
	}

	cachedHarnessModule = sourceRequire(
		"../../harness/wasmtime/index.cjs",
	) as WasmtimeHarnessModule;
	return cachedHarnessModule;
}

export const wasmtimeRuntime: Runtime = {
	name: "wasmtime",
	mutateCompilerArguments(compilerArguments) {
		setCompilerOptionValue(compilerArguments, "--exportStart", "__start");
	},
	createHarness(wasmBytes) {
		return resolveWasmtimeHarnessModule().createHarness(wasmBytes);
	},
};
