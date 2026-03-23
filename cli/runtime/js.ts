import { createRequire } from "node:module";
import type {
	Harness,
	HarnessCreateOptions,
} from "../../harness/shared/harness-types";
import { resolveSourceOrPackageModulePath } from "./module-paths";
import { setCompilerOptionValue, type Runtime } from "./types";

const sourceRequire = createRequire(import.meta.url);
const { createHarness } = sourceRequire(
	resolveSourceOrPackageModulePath({
		packageName: "@as-harness/js",
		sourceRelativePath: "../../harness/js/index.cjs",
		sourceRepoPath: ["harness", "js", "index.cjs"],
	}),
) as {
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
