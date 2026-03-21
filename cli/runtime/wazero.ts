import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import sharedStartModule from "../../harness/shared/start.cjs";
import type { Harness } from "../../harness/shared/harness-types";
import {
	WAZERO_PARALLEL_ENV_VAR,
	shouldRunWazeroInBand,
} from "./wazero-runtime-options";
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

function traceWazero(message: string) {
	if (process.env.AS_HARNESS_TRACE_WAZERO === "1") {
		console.error(`[wazero-runtime] ${message}`);
	}
}

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

function shouldBypassBundledWazeroClose() {
	return typeof WAZERO_TARGET !== "undefined";
}

function createBundledNativeHarness(
	nativeHarnessModule: WazeroHarnessModule,
	wasmBytes: Uint8Array,
) {
	traceWazero("creating bundled native harness");
	const harness = nativeHarnessModule.createHarness(Buffer.from(wasmBytes));
	traceWazero("created bundled native harness");

	if (!shouldBypassBundledWazeroClose()) {
		return harness;
	}

	const rawClose =
		typeof harness.close === "function" ? harness.close.bind(harness) : null;
	if (rawClose === null) {
		return harness;
	}

	// Packaged Bun builds on hosted Linux can hang while synchronously closing the
	// embedded Node-API-backed wazero runtime even though the one-shot CLI process
	// will exit immediately afterward. Leave bundled close teardown to process exit.
	harness.close = function bundledWazeroCloseNoop() {
		traceWazero("skipping bundled native harness close");
	};
	return harness;
}

function createBundledWazeroHarness(wasmBytes: Uint8Array) {
	const nativeHarnessModule = resolveWazeroHarnessModule();
	const bundledBytes = Buffer.from(wasmBytes);
	const runInBand = shouldRunWazeroInBand();

	traceWazero(
		runInBand
			? `decorating bundled wazero harness in-band; set ${WAZERO_PARALLEL_ENV_VAR}=1 to re-enable worker-thread execution`
			: "decorating bundled wazero harness with worker-thread execution",
	);
	return decorateHarness(
		createBundledNativeHarness(nativeHarnessModule, bundledBytes),
		{
			bytes: bundledBytes,
			createLocalHarness(localBytes) {
				return createBundledNativeHarness(nativeHarnessModule, localBytes);
			},
			runInBand,
			workerModulePath: runtimeModulePath,
		},
	);
}

export const wazeroRuntime: Runtime = {
	name: "wazero",
	mutateCompilerArguments(compilerArguments) {
		setCompilerOptionValue(compilerArguments, "--exportStart", "__start");
	},
	createHarness(wasmBytes) {
		if (typeof WAZERO_TARGET === "undefined") {
			traceWazero("resolving source wazero harness module");
			return resolveWazeroHarnessModule().createHarness(wasmBytes);
		}

		traceWazero("resolving bundled wazero harness module");
		return createBundledWazeroHarness(wasmBytes);
	},
};
