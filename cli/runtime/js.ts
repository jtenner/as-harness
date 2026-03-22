import jsHarnessModule from "../../harness/js/index.cjs";
import type {
	Harness,
	HarnessCreateOptions,
} from "../../harness/shared/harness-types";
import { setCompilerOptionValue, type Runtime } from "./types";

const { createHarness } = jsHarnessModule as {
	createHarness(bytes: Uint8Array, options?: HarnessCreateOptions): Harness;
};

export const jsRuntime: Runtime = {
	name: "js",
	mutateCompilerArguments(compilerArguments) {
		setCompilerOptionValue(compilerArguments, "--exportStart", "__start");
	},
	createHarness(wasmBytes, options) {
		return createHarness(wasmBytes, options);
	},
};
