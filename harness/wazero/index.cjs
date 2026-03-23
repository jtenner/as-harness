"use strict";

const native = require("./dist/wazero.node");
const { decorateHarness } = require("../shared/start.cjs");

function normalizeArtifactOptions(options = {}) {
	const artifactOptions =
		options &&
		typeof options === "object" &&
		options.artifactOptions &&
		typeof options.artifactOptions === "object"
			? options.artifactOptions
			: null;

	const sourceFileFallback =
		Array.isArray(artifactOptions?.sourceFiles) &&
		artifactOptions.sourceFiles.length === 1 &&
		typeof artifactOptions.sourceFiles[0] === "string"
			? artifactOptions.sourceFiles[0]
			: "";

	return {
		projectRoot:
			typeof artifactOptions?.projectRoot === "string"
				? artifactOptions.projectRoot
				: "",
		sourceFileFallback,
		updateSnapshots: artifactOptions?.updateSnapshots === true,
	};
}

function toWasmBytes(value) {
	if (Buffer.isBuffer(value)) {
		return Uint8Array.from(value);
	}

	if (ArrayBuffer.isView(value)) {
		return Uint8Array.from(
			new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
		);
	}

	if (value instanceof ArrayBuffer) {
		return Uint8Array.from(new Uint8Array(value));
	}

	throw new TypeError(
		"createHarness expects a Buffer, Uint8Array, or ArrayBuffer",
	);
}

function createHarness(bytes, options = {}) {
	const wasmBytes = Buffer.from(toWasmBytes(bytes));
	const artifactOptions = normalizeArtifactOptions(options);
	const runInBand = artifactOptions.updateSnapshots === true;

	return decorateHarness(
		native.createHarness(
			wasmBytes,
			"",
			artifactOptions.projectRoot,
			artifactOptions.sourceFileFallback,
			artifactOptions.updateSnapshots,
		),
		{
			bytes: wasmBytes,
			createLocalHarness: (localBytes, localOptions = options) => {
				const localArtifactOptions = normalizeArtifactOptions(localOptions);
				return native.createHarness(
					Buffer.from(toWasmBytes(localBytes)),
					"",
					localArtifactOptions.projectRoot,
					localArtifactOptions.sourceFileFallback,
					localArtifactOptions.updateSnapshots,
				);
			},
			createHarnessOptions: options,
			runInBand,
			workerModulePath: __filename,
		},
	);
}

module.exports = {
	createHarness,
};
