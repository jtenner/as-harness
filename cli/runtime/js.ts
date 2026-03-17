import { createRequire } from "node:module";
import type { Harness } from "../../harness/shared/harness-types";
import { setCompilerOptionValue, type Runtime } from "./types";

const require = createRequire(import.meta.url);
const { createHarness } = require("../../harness/js/index.cjs") as {
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
