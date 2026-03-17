import { createRequire } from "node:module";
import type { Harness } from "../../harness/shared/harness-types";
import { setCompilerOptionValue, type Runtime } from "./types";

const require = createRequire(import.meta.url);
const { createHarness } = require("../../harness/wazero/index.cjs") as {
	createHarness(bytes: Uint8Array): Harness;
};

export const wazeroRuntime: Runtime = {
	name: "wazero",
	mutateCompilerArguments(compilerArguments) {
		setCompilerOptionValue(compilerArguments, "--exportStart", "__start");
	},
	createHarness(wasmBytes) {
		return createHarness(wasmBytes);
	},
};
