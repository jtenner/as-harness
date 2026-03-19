import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import sharedStartModule from "../../harness/shared/start.cjs";
import type { Harness } from "../../harness/shared/harness-types";
import { setCompilerOptionValue, type Runtime } from "./types";

declare const WAZERO_TARGET: string | undefined;
declare const WAZERO_NODE_PATH: string | null | undefined;

type WazeroHarnessModule = {
	createHarness(bytes: Uint8Array): Harness;
};

type DecorateHarnessOptions = {
	bytes: Uint8Array;
	createLocalHarness(bytes: Uint8Array): Harness;
	runInBand: boolean;
	workerModulePath: string;
};

const sourceRequire = createRequire(import.meta.url);
const { decorateHarness } = sharedStartModule as {
	decorateHarness(harness: Harness, options: DecorateHarnessOptions): Harness;
};
const runtimeModulePath = fileURLToPath(import.meta.url);
let cachedHarnessModule: WazeroHarnessModule | null = null;

function loadSourceWazeroHarnessModule(): WazeroHarnessModule {
	const sourceSpecifier = ["..", "..", "harness", "wazero", "index.cjs"].join(
		"/",
	);
	return sourceRequire(sourceSpecifier) as WazeroHarnessModule;
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

function resolveWazeroHarnessModule() {
	if (cachedHarnessModule !== null) {
		return cachedHarnessModule;
	}

	cachedHarnessModule = loadBundledWazeroHarnessModule();
	return cachedHarnessModule;
}

function createBundledWazeroHarness(wasmBytes: Uint8Array) {
	const nativeHarnessModule = resolveWazeroHarnessModule();
	const bundledBytes = Buffer.from(wasmBytes);

	return decorateHarness(nativeHarnessModule.createHarness(bundledBytes), {
		bytes: bundledBytes,
		createLocalHarness(localBytes) {
			return nativeHarnessModule.createHarness(Buffer.from(localBytes));
		},
		runInBand: true,
		workerModulePath: runtimeModulePath,
	});
}

export const wazeroRuntime: Runtime = {
	name: "wazero",
	mutateCompilerArguments(compilerArguments) {
		setCompilerOptionValue(compilerArguments, "--exportStart", "__start");
	},
	createHarness(wasmBytes) {
		if (typeof WAZERO_TARGET === "undefined") {
			return resolveWazeroHarnessModule().createHarness(wasmBytes);
		}

		return createBundledWazeroHarness(wasmBytes);
	},
};
