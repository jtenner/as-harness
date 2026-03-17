import jsHarnessModule from "../../harness/js/index.cjs";
import type { Harness } from "../../harness/shared/harness-types";
import { setCompilerOptionValue, type Runtime } from "./types";

const { createHarness } = jsHarnessModule as {
	createHarness(bytes: Uint8Array): Harness;
};

export const jsRuntime: Runtime = {
	name: "js",
	mutateCompilerArguments(compilerArguments) {
		setCompilerOptionValue(compilerArguments, "--exportStart", "__start");
	},
	createHarness(wasmBytes) {
		return createHarness(wasmBytes);
	},
};
