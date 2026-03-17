import { createRequire } from "node:module";
import type { Harness } from "../../harness/shared/harness-types";
import { setCompilerOptionValue, type Runtime } from "./types";

const require = createRequire(import.meta.url);
declare const WAZERO_TARGET: string | undefined;

type WazeroHarnessModule = {
	createHarness(bytes: Uint8Array): Harness;
};

function loadBundledWazeroHarnessModule(): WazeroHarnessModule | null {
	if (typeof WAZERO_TARGET === "undefined") {
		return null;
	}

	switch (WAZERO_TARGET) {
		case "darwin-arm64":
			return require("../n-api/darwin-arm64.node") as WazeroHarnessModule;
		case "darwin-x64":
			return require("../n-api/darwin-x64.node") as WazeroHarnessModule;
		case "linux-arm64-gnu":
			return require("../n-api/linux-arm64-gnu.node") as WazeroHarnessModule;
		case "linux-x64-gnu":
			return require("../n-api/linux-x64-gnu.node") as WazeroHarnessModule;
		case "windows-x64":
			return require("../n-api/windows-x64.node") as WazeroHarnessModule;
		case "unavailable":
			throw new Error(
				"The wazero harness was not bundled for this build target.",
			);
		default:
			throw new Error(`Unknown bundled wazero target: ${WAZERO_TARGET}`);
	}
}

const { createHarness } =
	loadBundledWazeroHarnessModule() ??
	(require("../../harness/wazero/index.cjs") as WazeroHarnessModule);

export const wazeroRuntime: Runtime = {
	name: "wazero",
	mutateCompilerArguments(compilerArguments) {
		setCompilerOptionValue(compilerArguments, "--exportStart", "__start");
	},
	createHarness(wasmBytes) {
		return createHarness(wasmBytes);
	},
};
