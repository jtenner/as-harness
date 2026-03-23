import { createRequire } from "node:module";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
	Harness,
	HarnessCreateOptions,
} from "../../harness/shared/harness-types";
import { resolveSourceOrPackageModulePath } from "./module-paths";
import { setCompilerOptionValue, type Runtime } from "./types";

declare const WAZERO_TARGET: string | undefined;
declare const WAZERO_EMBEDDED_MODULE_PATH: string | null | undefined;

type WazeroHarnessModule = {
	createHarness(
		bytes: Uint8Array,
		engine?: string,
		projectRoot?: string,
		sourceFileFallback?: string,
		updateSnapshots?: boolean,
	): Harness;
};

type DecorateHarnessOptions = {
	bytes: Uint8Array;
	createLocalHarness(
		bytes: Uint8Array,
		options?: HarnessCreateOptions,
	): Harness;
	createHarnessOptions?: HarnessCreateOptions;
	runInBand: boolean;
	workerModulePath: string;
};

const WAZERO_ENGINE_INTERPRETER = "interpreter";
const sourceRequire = createRequire(import.meta.url);
const runtimeModulePath = fileURLToPath(import.meta.url);
const sourceHarnessModulePath = resolveSourceOrPackageModulePath({
	packageName: "@as-harness/wazero",
	sourceRelativePath: fileURLToPath(
		new URL("./wazero-source-worker.cjs", import.meta.url),
	),
	sourceRepoPath: ["cli", "runtime", "wazero-source-worker.cjs"],
});
let cachedHarnessModule: WazeroHarnessModule | null = null;
let bundledAddonTempDirectory: string | null = null;

function traceWazero(message: string) {
	if (process.env.AS_HARNESS_TRACE_WAZERO === "1") {
		console.error(`[wazero-runtime] ${message}`);
	}
}

function loadSourceWazeroHarnessModule(): WazeroHarnessModule {
	return sourceRequire(sourceHarnessModulePath) as WazeroHarnessModule;
}

function resolveDecorateHarness() {
	return sourceRequire(
		resolveSourceOrPackageModulePath({
			packageName: "@as-harness/shared/start",
			sourceRelativePath: "../../harness/shared/start.cjs",
			sourceRepoPath: ["harness", "shared", "start.cjs"],
		}),
	) as {
		decorateHarness(harness: Harness, options: DecorateHarnessOptions): Harness;
	};
}

function loadBundledWazeroHarnessModule(): WazeroHarnessModule {
	if (typeof WAZERO_TARGET === "undefined") {
		return loadSourceWazeroHarnessModule();
	}

	if (WAZERO_TARGET === "unavailable" || WAZERO_EMBEDDED_MODULE_PATH == null) {
		throw new Error(
			"The wazero harness was not bundled for this build target.",
		);
	}

	traceWazero("loading embedded wazero addon payload module");
	const payloadModule = require(WAZERO_EMBEDDED_MODULE_PATH) as
		| { default?: string }
		| string;
	const encodedAddon =
		typeof payloadModule === "string" ? payloadModule : payloadModule.default;
	if (typeof encodedAddon !== "string" || encodedAddon.length === 0) {
		throw new Error("The bundled wazero addon payload is missing.");
	}

	traceWazero("extracting bundled wazero addon payload");
	const addonDirectory = mkdtempSync(
		join(tmpdir(), "as-harness-wazero-addon-"),
	);
	const addonPath = join(addonDirectory, "wazero.node");
	writeFileSync(addonPath, Buffer.from(encodedAddon, "base64"));
	bundledAddonTempDirectory = addonDirectory;

	process.once("exit", () => {
		if (bundledAddonTempDirectory === null) {
			return;
		}

		try {
			rmSync(bundledAddonTempDirectory, { force: true, recursive: true });
		} catch {}
	});

	traceWazero("loading extracted bundled wazero addon");
	const harnessModule = sourceRequire(addonPath) as WazeroHarnessModule;
	traceWazero("loaded extracted bundled wazero addon");
	return harnessModule;
}

function resolveWazeroHarnessModule() {
	if (cachedHarnessModule !== null) {
		return cachedHarnessModule;
	}

	cachedHarnessModule = loadBundledWazeroHarnessModule();
	return cachedHarnessModule;
}

function shouldUseBundledLinuxInterpreterEngine() {
	// Packaged Linux builds stay on the interpreter engine as the deliberate
	// stability policy for the current release line.
	return typeof WAZERO_TARGET !== "undefined" && process.platform === "linux";
}

function normalizeArtifactOptions(options) {
	const artifactOptions =
		options &&
		typeof options === "object" &&
		options.artifactOptions &&
		typeof options.artifactOptions === "object"
			? options.artifactOptions
			: null;

	return {
		projectRoot:
			typeof artifactOptions?.projectRoot === "string"
				? artifactOptions.projectRoot
				: "",
		sourceFileFallback:
			Array.isArray(artifactOptions?.sourceFiles) &&
			artifactOptions.sourceFiles.length === 1 &&
			typeof artifactOptions.sourceFiles[0] === "string"
				? artifactOptions.sourceFiles[0]
				: "",
		updateSnapshots: artifactOptions?.updateSnapshots === true,
	};
}

function createBundledNativeHarness(
	nativeHarnessModule: WazeroHarnessModule,
	wasmBytes: Uint8Array,
	options: HarnessCreateOptions | undefined,
) {
	traceWazero("creating bundled native harness");
	const engine = shouldUseBundledLinuxInterpreterEngine()
		? WAZERO_ENGINE_INTERPRETER
		: "";
	const artifactOptions = normalizeArtifactOptions(options);
	if (engine === WAZERO_ENGINE_INTERPRETER) {
		traceWazero("forcing bundled Linux wazero interpreter engine");
	}
	const harness = nativeHarnessModule.createHarness(
		Buffer.from(wasmBytes),
		engine,
		artifactOptions.projectRoot,
		artifactOptions.sourceFileFallback,
		artifactOptions.updateSnapshots,
	);
	traceWazero("created bundled native harness");
	return harness;
}

function createBundledWazeroHarness(
	wasmBytes: Uint8Array,
	options: HarnessCreateOptions | undefined,
) {
	const nativeHarnessModule = resolveWazeroHarnessModule();
	const bundledBytes = Buffer.from(wasmBytes);
	const artifactOptions = normalizeArtifactOptions(options);
	const runInBand = artifactOptions.updateSnapshots === true;

	traceWazero("decorating bundled wazero harness");
	return resolveDecorateHarness().decorateHarness(
		createBundledNativeHarness(nativeHarnessModule, bundledBytes, options),
		{
			bytes: bundledBytes,
			createLocalHarness(localBytes, localOptions = options) {
				return createBundledNativeHarness(
					nativeHarnessModule,
					localBytes,
					localOptions,
				);
			},
			createHarnessOptions: options,
			runInBand,
			workerModulePath: runtimeModulePath,
		},
	);
}

function createSourceWazeroHarness(
	wasmBytes: Uint8Array,
	options: HarnessCreateOptions | undefined,
) {
	const nativeHarnessModule = resolveWazeroHarnessModule();
	const sourceBytes = Buffer.from(wasmBytes);
	const artifactOptions = normalizeArtifactOptions(options);
	const runInBand = artifactOptions.updateSnapshots === true;

	traceWazero("decorating source wazero harness");
	return resolveDecorateHarness().decorateHarness(
		nativeHarnessModule.createHarness(
			sourceBytes,
			"",
			artifactOptions.projectRoot,
			artifactOptions.sourceFileFallback,
			artifactOptions.updateSnapshots,
		),
		{
			bytes: sourceBytes,
			createLocalHarness(localBytes, localOptions = options) {
				const localArtifactOptions = normalizeArtifactOptions(localOptions);
				return nativeHarnessModule.createHarness(
					Buffer.from(localBytes),
					"",
					localArtifactOptions.projectRoot,
					localArtifactOptions.sourceFileFallback,
					localArtifactOptions.updateSnapshots,
				);
			},
			createHarnessOptions: options,
			runInBand,
			workerModulePath: sourceHarnessModulePath,
		},
	);
}

export const wazeroRuntime: Runtime = {
	name: "wazero",
	mutateCompilerArguments(compilerArguments) {
		setCompilerOptionValue(compilerArguments, "--exportStart", "__start");
	},
	createHarness(wasmBytes, options) {
		if (typeof WAZERO_TARGET === "undefined") {
			traceWazero("resolving source wazero harness module");
			return createSourceWazeroHarness(wasmBytes, options);
		}

		traceWazero("resolving bundled wazero harness module");
		return createBundledWazeroHarness(wasmBytes, options);
	},
};
