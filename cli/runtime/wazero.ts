import type { Harness } from "../../harness/shared/harness-types";
import { setCompilerOptionValue, type Runtime } from "./types";

declare const WAZERO_TARGET: string | undefined;
declare const WAZERO_NODE_PATH: string | null | undefined;

type WazeroHarnessModule = {
	createHarness(bytes: Uint8Array): Harness;
};

function loadSourceWazeroHarnessModule(): WazeroHarnessModule {
	return require("../../harness/wazero/index.cjs") as WazeroHarnessModule;
}

function loadBundledWazeroHarnessModule(): WazeroHarnessModule {
	if (typeof WAZERO_TARGET === "undefined") {
		return loadSourceWazeroHarnessModule();
	}

	if (WAZERO_TARGET === "unavailable" || WAZERO_NODE_PATH == null) {
		throw new Error(
			"The wazero harness was not bundled for this build target.",
		);
	}

	// Bun folds the build-time-defined string into a single require("./addon.node")
	// call, which allows the executable bundler to embed only the selected addon.
	return require(WAZERO_NODE_PATH) as WazeroHarnessModule;
}

const { createHarness } = loadBundledWazeroHarnessModule();

export const wazeroRuntime: Runtime = {
	name: "wazero",
	mutateCompilerArguments(compilerArguments) {
		setCompilerOptionValue(compilerArguments, "--exportStart", "__start");
	},
	createHarness(wasmBytes) {
		return createHarness(wasmBytes);
	},
};
