"use strict";

const native = require("./dist/wasmtime.node");
const { decorateHarness } = require("../shared/start.cjs");

const UINT32_BYTE_LENGTH = 4;

const EVENT_KIND_NODE_FOUND = 1;
const EVENT_KIND_NODE_START = 2;
const EVENT_KIND_NODE_PASS = 3;
const EVENT_KIND_FAIL_MESSAGE = 4;
const EVENT_KIND_CALLBACK_START = 5;
const EVENT_KIND_CALLBACK_PASS = 6;
const EVENT_KIND_DIAGNOSTIC = 7;
const EVENT_KIND_NODE_FAIL = 8;
const EVENT_KIND_CALLBACK_FAIL = 9;

const textDecoder = new TextDecoder();

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

function assertCallback(callback) {
	if (typeof callback !== "function") {
		throw new TypeError("expected a callback function");
	}
}

function assertExportName(exportName) {
	if (typeof exportName !== "string") {
		throw new TypeError("expected an export name");
	}
}

function readUtf8(bytes, start, length) {
	return textDecoder.decode(bytes.subarray(start, start + length));
}

function decodeUint32(bytes, offset) {
	if (offset + UINT32_BYTE_LENGTH > bytes.byteLength) {
		return null;
	}

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return {
		value: view.getUint32(offset, true),
		offset: offset + UINT32_BYTE_LENGTH,
	};
}

function decodeNodeIndex(bytes, offset) {
	const header = decodeUint32(bytes, offset);
	if (header === null) {
		return null;
	}

	const requiredByteLength = header.value * UINT32_BYTE_LENGTH;
	if (header.offset + requiredByteLength > bytes.byteLength) {
		return null;
	}

	const nodeIndex = [];
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	for (let index = 0; index < header.value; index += 1) {
		nodeIndex.push(
			view.getUint32(header.offset + index * UINT32_BYTE_LENGTH, true),
		);
	}

	return {
		nodeIndex,
		offset: header.offset + requiredByteLength,
	};
}

function decodeNodeEvent(bytes) {
	const decoded = decodeNodeIndex(bytes, 0);
	if (decoded === null) {
		return null;
	}

	return { nodeIndex: decoded.nodeIndex };
}

function decodeNodeFoundEvent(bytes) {
	const decodedNodeIndex = decodeNodeIndex(bytes, 0);
	if (decodedNodeIndex === null || decodedNodeIndex.offset + 8 > bytes.byteLength) {
		return null;
	}

	const nameLength = decodeUint32(bytes, decodedNodeIndex.offset + 4);
	if (nameLength === null) {
		return null;
	}
	if (nameLength.offset + nameLength.value > bytes.byteLength) {
		return null;
	}

	return {
		nodeIndex: decodedNodeIndex.nodeIndex,
		kind: bytes[decodedNodeIndex.offset],
		declarationMode: bytes[decodedNodeIndex.offset + 1],
		name: readUtf8(bytes, nameLength.offset, nameLength.value),
	};
}

function decodeCallbackEvent(bytes) {
	if (bytes.byteLength < 8) {
		return null;
	}

	const decodedNodeIndex = decodeNodeIndex(bytes, 4);
	if (decodedNodeIndex === null) {
		return null;
	}

	return {
		hook: bytes[0],
		nodeIndex: decodedNodeIndex.nodeIndex,
	};
}

function decodeNodeFailureEvent(bytes) {
	if (bytes.byteLength < 8) {
		return null;
	}

	const decodedNodeIndex = decodeNodeIndex(bytes, 4);
	if (decodedNodeIndex === null) {
		return null;
	}

	return {
		failureKind: bytes[0],
		nodeIndex: decodedNodeIndex.nodeIndex,
	};
}

function decodeCallbackFailureEvent(bytes) {
	if (bytes.byteLength < 8) {
		return null;
	}

	const decodedNodeIndex = decodeNodeIndex(bytes, 4);
	if (decodedNodeIndex === null) {
		return null;
	}

	return {
		hook: bytes[0],
		failureKind: bytes[1],
		nodeIndex: decodedNodeIndex.nodeIndex,
	};
}

function decodeFailMessageEvent(bytes) {
	return {
		message: readUtf8(bytes, 0, bytes.byteLength),
	};
}

function decodeDiagnosticEvent(bytes) {
	const decodedNodeIndex = decodeNodeIndex(bytes, 0);
	if (decodedNodeIndex === null) {
		return null;
	}

	const messageLength = decodeUint32(bytes, decodedNodeIndex.offset);
	if (messageLength === null) {
		return null;
	}
	if (messageLength.offset + messageLength.value > bytes.byteLength) {
		return null;
	}

	return {
		nodeIndex: decodedNodeIndex.nodeIndex,
		message: readUtf8(bytes, messageLength.offset, messageLength.value),
	};
}

function decodeEvent(kind, bytes) {
	switch (kind) {
		case EVENT_KIND_NODE_FOUND:
			return decodeNodeFoundEvent(bytes);
		case EVENT_KIND_NODE_START:
		case EVENT_KIND_NODE_PASS:
			return decodeNodeEvent(bytes);
		case EVENT_KIND_FAIL_MESSAGE:
			return decodeFailMessageEvent(bytes);
		case EVENT_KIND_CALLBACK_START:
		case EVENT_KIND_CALLBACK_PASS:
			return decodeCallbackEvent(bytes);
		case EVENT_KIND_DIAGNOSTIC:
			return decodeDiagnosticEvent(bytes);
		case EVENT_KIND_NODE_FAIL:
			return decodeNodeFailureEvent(bytes);
		case EVENT_KIND_CALLBACK_FAIL:
			return decodeCallbackFailureEvent(bytes);
		default:
			return null;
	}
}

class Harness {
	#nativeHarness;
	#callbacks = {
		nodeFound: null,
		nodeStart: null,
		nodePass: null,
		nodeFail: null,
		failMessage: null,
		callbackStart: null,
		callbackPass: null,
		callbackFail: null,
		diagnostic: null,
	};

	constructor(nativeHarness) {
		this.#nativeHarness = nativeHarness;
	}

	onNodeFound(callback) {
		assertCallback(callback);
		this.#callbacks.nodeFound = callback;
	}

	onNodeStart(callback) {
		assertCallback(callback);
		this.#callbacks.nodeStart = callback;
	}

	onNodePass(callback) {
		assertCallback(callback);
		this.#callbacks.nodePass = callback;
	}

	onNodeFail(callback) {
		assertCallback(callback);
		this.#callbacks.nodeFail = callback;
	}

	onFailMessage(callback) {
		assertCallback(callback);
		this.#callbacks.failMessage = callback;
	}

	onCallbackStart(callback) {
		assertCallback(callback);
		this.#callbacks.callbackStart = callback;
	}

	onCallbackPass(callback) {
		assertCallback(callback);
		this.#callbacks.callbackPass = callback;
	}

	onCallbackFail(callback) {
		assertCallback(callback);
		this.#callbacks.callbackFail = callback;
	}

	onDiagnostic(callback) {
		assertCallback(callback);
		this.#callbacks.diagnostic = callback;
	}

	callI32(exportName) {
		assertExportName(exportName);
		return this.#nativeHarness.callI32(exportName);
	}

	discover(nodeIndex) {
		const normalizedNodeIndex = this.#normalizeNodeIndex(nodeIndex);
		if (normalizedNodeIndex === null) {
			return false;
		}

		const result = this.#nativeHarness.discover(normalizedNodeIndex);
		this.#dispatchEvents(result.events);
		return result.ok;
	}

	run(nodeIndex) {
		const normalizedNodeIndex = this.#normalizeNodeIndex(nodeIndex);
		if (normalizedNodeIndex === null) {
			return false;
		}

		const result = this.#nativeHarness.run(normalizedNodeIndex);
		this.#dispatchEvents(result.events);
		return result.ok;
	}

	close() {
		this.#nativeHarness.close();
	}

	#dispatchEvents(events) {
		for (const { kind, payload } of events) {
			const callback = this.#callbackForEventKind(kind >>> 0);
			if (callback === null) {
				continue;
			}

			const decoded = decodeEvent(kind >>> 0, Uint8Array.from(payload));
			if (decoded !== null) {
				callback(decoded);
			}
		}
	}

	#normalizeNodeIndex(value) {
		if (!Array.isArray(value)) {
			return null;
		}

		const nodeIndex = [];
		for (const element of value) {
			if (
				typeof element !== "number" ||
				!Number.isInteger(element) ||
				element < 0 ||
				element > 0xffff_ffff
			) {
				return null;
			}

			nodeIndex.push(element >>> 0);
		}

		return nodeIndex;
	}

	#callbackForEventKind(kind) {
		switch (kind) {
			case EVENT_KIND_NODE_FOUND:
				return this.#callbacks.nodeFound;
			case EVENT_KIND_NODE_START:
				return this.#callbacks.nodeStart;
			case EVENT_KIND_NODE_PASS:
				return this.#callbacks.nodePass;
			case EVENT_KIND_NODE_FAIL:
				return this.#callbacks.nodeFail;
			case EVENT_KIND_FAIL_MESSAGE:
				return this.#callbacks.failMessage;
			case EVENT_KIND_CALLBACK_START:
				return this.#callbacks.callbackStart;
			case EVENT_KIND_CALLBACK_PASS:
				return this.#callbacks.callbackPass;
			case EVENT_KIND_CALLBACK_FAIL:
				return this.#callbacks.callbackFail;
			case EVENT_KIND_DIAGNOSTIC:
				return this.#callbacks.diagnostic;
			default:
				return null;
		}
	}
}

function createLocalHarness(bytes) {
	return new Harness(native.createHarness(toWasmBytes(bytes)));
}

function createHarness(bytes) {
	const wasmBytes = toWasmBytes(bytes);
	return decorateHarness(createLocalHarness(wasmBytes), {
		bytes: wasmBytes,
		createLocalHarness,
		workerModulePath: __filename,
	});
}

module.exports = {
	createHarness,
};
