"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const sourceAddonPath = path.resolve(
	__dirname,
	"..",
	"..",
	"harness",
	"wazero",
	"dist",
	"wazero.node",
);
let cachedNative = null;
let cachedTempDirectory = null;
let cachedTempAddonPath = null;
let cleanupRegistered = false;

function shouldIsolateSourceAddonLoad(
	platform = process.platform,
	bunVersion = process.versions?.bun,
) {
	return (
		platform === "win32" &&
		typeof bunVersion === "string" &&
		bunVersion.length > 0
	);
}

function copyAddonToPrivateTempDirectory(
	addonPath,
	tempRoot = os.tmpdir(),
	mkdtemp = fs.mkdtempSync,
	copyFile = fs.copyFileSync,
) {
	const addonDirectory = mkdtemp(
		path.join(tempRoot, "as-harness-wazero-source-addon-"),
	);
	const stagedAddonPath = path.join(addonDirectory, "wazero.node");
	copyFile(addonPath, stagedAddonPath);
	return {
		addonDirectory,
		addonPath: stagedAddonPath,
	};
}

function registerTempAddonCleanup() {
	if (cleanupRegistered) {
		return;
	}

	cleanupRegistered = true;
	process.once("exit", () => {
		if (cachedTempDirectory === null) {
			return;
		}

		try {
			fs.rmSync(cachedTempDirectory, { force: true, recursive: true });
		} catch {}
	});
}

function resolveLoadableAddonPath() {
	if (!shouldIsolateSourceAddonLoad()) {
		return sourceAddonPath;
	}

	if (cachedTempAddonPath !== null) {
		return cachedTempAddonPath;
	}

	// Bun on Windows is more stable when the source addon is loaded from a
	// private copy instead of the repo build output path.
	const stagedAddon = copyAddonToPrivateTempDirectory(sourceAddonPath);
	cachedTempDirectory = stagedAddon.addonDirectory;
	cachedTempAddonPath = stagedAddon.addonPath;
	registerTempAddonCleanup();
	return cachedTempAddonPath;
}

function loadNative() {
	if (cachedNative !== null) {
		return cachedNative;
	}

	cachedNative = require(resolveLoadableAddonPath());
	return cachedNative;
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

function createHarness(bytes) {
	return loadNative().createHarness(Buffer.from(toWasmBytes(bytes)));
}

module.exports = {
	createHarness,
	__test: {
		copyAddonToPrivateTempDirectory,
		shouldIsolateSourceAddonLoad,
		sourceAddonPath,
	},
};
