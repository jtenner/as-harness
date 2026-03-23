import { createRequire } from "node:module";
import type {
	Harness,
	HarnessCreateOptions,
} from "../../harness/shared/harness-types";
import { resolveSourceOrPackageModulePath } from "./module-paths";
import { setCompilerOptionValue, type Runtime } from "./types";

type WasmtimeHarnessModule = {
	createHarness(bytes: Uint8Array, options?: HarnessCreateOptions): Harness;
};

const sourceRequire = createRequire(import.meta.url);
const sourceHarnessModulePath = resolveSourceOrPackageModulePath({
	packageName: "@as-harness/wasmtime",
	sourceRelativePath: "../../harness/wasmtime/index.cjs",
	sourceRepoPath: ["harness", "wasmtime", "index.cjs"],
});
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
