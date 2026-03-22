"use strict";

const native = require("./dist/wazero.node");
const { decorateHarness } = require("../shared/start.cjs");

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
	const wasmBytes = Buffer.from(toWasmBytes(bytes));

	return decorateHarness(native.createHarness(wasmBytes), {
		bytes: wasmBytes,
		createLocalHarness: (localBytes) =>
			native.createHarness(Buffer.from(toWasmBytes(localBytes))),
		runInBand: false,
		workerModulePath: __filename,
	});
}

module.exports = {
	createHarness,
};
