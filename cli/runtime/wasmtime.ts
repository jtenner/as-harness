import { createRequire } from "node:module";
import { resolve } from "node:path";
import type {
	Harness,
	HarnessCreateOptions,
} from "../../harness/shared/harness-types";
import { setCompilerOptionValue, type Runtime } from "./types";

type WasmtimeHarnessModule = {
	createHarness(bytes: Uint8Array, options?: HarnessCreateOptions): Harness;
};

const sourceRequire = createRequire(import.meta.url);
const sourceCliRepoDir = process.env.AS_HARNESS_SOURCE_CLI_REPO_DIR ?? "";
const sourceHarnessModulePath =
	sourceCliRepoDir.length > 0
		? resolve(sourceCliRepoDir, "harness", "wasmtime", "index.cjs")
		: "../../harness/wasmtime/index.cjs";
let cachedHarnessModule: WasmtimeHarnessModule | null = null;

function resolveWasmtimeHarnessModule() {
	if (cachedHarnessModule !== null) {
		return cachedHarnessModule;
	}

	cachedHarnessModule = sourceRequire(
		sourceHarnessModulePath,
	) as WasmtimeHarnessModule;
	return cachedHarnessModule;
}

export const wasmtimeRuntime: Runtime = {
	name: "wasmtime",
	mutateCompilerArguments(compilerArguments) {
		setCompilerOptionValue(compilerArguments, "--exportStart", "__start");
	},
	createHarness(wasmBytes, options) {
		return resolveWasmtimeHarnessModule().createHarness(wasmBytes, options);
	},
};
