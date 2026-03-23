"use strict";

const native = require("./dist/wasmtime.node");
const { decorateHarness } = require("../shared/start.cjs");
const { cloneCoverageSnapshot } = require("../shared/covers.cjs");

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
const EVENT_KIND_LOG = 10;

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

function normalizeArtifactOptions(options = {}) {
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

	return {
		nodeIndex: decoded.nodeIndex,
		nodeId: decodeUint32(bytes, decoded.offset)?.value ?? 0,
	};
}

function decodeNodeFoundEvent(bytes) {
	const decodedNodeIndex = decodeNodeIndex(bytes, 0);
	if (
		decodedNodeIndex === null ||
		decodedNodeIndex.offset + 24 > bytes.byteLength
	) {
		return null;
	}

	const nodeId = decodeUint32(bytes, decodedNodeIndex.offset);
	if (nodeId === null) {
		return null;
	}

	const parentNodeId = decodeUint32(bytes, nodeId.offset);
	if (parentNodeId === null) {
		return null;
	}

	const declarationOrder = decodeUint32(bytes, parentNodeId.offset);
	if (
		declarationOrder === null ||
		declarationOrder.offset + 12 > bytes.byteLength
	) {
		return null;
	}

	const dependencyCount = decodeUint32(bytes, declarationOrder.offset + 8);
	if (dependencyCount === null) {
		return null;
	}
	const dependencyNodeIdsByteLength =
		dependencyCount.value * UINT32_BYTE_LENGTH;
	if (
		dependencyCount.offset + dependencyNodeIdsByteLength + 4 >
		bytes.byteLength
	) {
		return null;
	}

	const dependencyNodeIds = [];
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	for (let index = 0; index < dependencyCount.value; index += 1) {
		dependencyNodeIds.push(
			view.getUint32(dependencyCount.offset + index * UINT32_BYTE_LENGTH, true),
		);
	}

	const nameLength = decodeUint32(
		bytes,
		dependencyCount.offset + dependencyNodeIdsByteLength,
	);
	if (nameLength === null) {
		return null;
	}
	if (nameLength.offset + nameLength.value > bytes.byteLength) {
		return null;
	}

	return {
		nodeIndex: decodedNodeIndex.nodeIndex,
		nodeId: nodeId.value,
		parentNodeId: parentNodeId.value,
		declarationOrder: declarationOrder.value,
		kind: bytes[declarationOrder.offset],
		declarationMode: bytes[declarationOrder.offset + 1],
		sequenceMode: bytes[declarationOrder.offset + 2],
		preferredRunnerMode: bytes[declarationOrder.offset + 5],
		preferredFailurePolicy: bytes[declarationOrder.offset + 6],
		dependencyNodeIds,
		only: bytes[declarationOrder.offset + 3] !== 0,
		expectFailure: bytes[declarationOrder.offset + 4] !== 0,
		name: readUtf8(bytes, nameLength.offset, nameLength.value),
	};
}

function decodeCallbackEvent(bytes) {
	if (bytes.byteLength < 12) {
		return null;
	}

	const decodedNodeIndex = decodeNodeIndex(bytes, 8);
	if (decodedNodeIndex === null) {
		return null;
	}

	return {
		hook: bytes[0],
		nodeId: decodeUint32(bytes, 4)?.value ?? 0,
		nodeIndex: decodedNodeIndex.nodeIndex,
	};
}

function decodeNodeFailureEvent(bytes) {
	if (bytes.byteLength < 12) {
		return null;
	}

	const decodedNodeIndex = decodeNodeIndex(bytes, 8);
	if (decodedNodeIndex === null) {
		return null;
	}

	return {
		failureKind: bytes[0],
		nodeId: decodeUint32(bytes, 4)?.value ?? 0,
		nodeIndex: decodedNodeIndex.nodeIndex,
	};
}

function decodeCallbackFailureEvent(bytes) {
	if (bytes.byteLength < 12) {
		return null;
	}

	const decodedNodeIndex = decodeNodeIndex(bytes, 8);
	if (decodedNodeIndex === null) {
		return null;
	}

	return {
		hook: bytes[0],
		failureKind: bytes[1],
		nodeId: decodeUint32(bytes, 4)?.value ?? 0,
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

function decodeFloat64(bytes, offset) {
	if (offset + 8 > bytes.byteLength) {
		return null;
	}

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return {
		value: view.getFloat64(offset, true),
		offset: offset + 8,
	};
}

function decodeLogEvent(bytes) {
	const valueCount = decodeUint32(bytes, 0);
	if (valueCount === null) {
		return null;
	}

	const values = [];
	let offset = valueCount.offset;
	for (let index = 0; index < valueCount.value; index += 1) {
		const decoded = decodeFloat64(bytes, offset);
		if (decoded === null) {
			return null;
		}

		values.push(decoded.value);
		offset = decoded.offset;
	}

	const messageLength = decodeUint32(bytes, offset);
	if (messageLength === null) {
		return null;
	}
	if (messageLength.offset + messageLength.value > bytes.byteLength) {
		return null;
	}

	return {
		message: readUtf8(bytes, messageLength.offset, messageLength.value),
		source: "trace",
		values,
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
		case EVENT_KIND_LOG:
			return decodeLogEvent(bytes);
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
		log: null,
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

	onLog(callback) {
		assertCallback(callback);
		this.#callbacks.log = callback;
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

	getCoverageSnapshot() {
		const snapshot = this.#nativeHarness.getCoverageSnapshot();
		if (snapshot === null || typeof snapshot !== "object") {
			return null;
		}

		return cloneCoverageSnapshot({
			points: Array.isArray(snapshot.points)
				? snapshot.points.map((point) => ({
						id: point.id >>> 0,
						file: typeof point.file === "string" ? point.file : "",
						line: typeof point.line === "number" ? point.line | 0 : 0,
						column: typeof point.column === "number" ? point.column | 0 : 0,
						coverType:
							typeof point.cover_type === "number"
								? point.cover_type >>> 0
								: typeof point.coverType === "number"
									? point.coverType >>> 0
									: 0,
					}))
				: [],
			coveredIds: Array.isArray(snapshot.covered_ids)
				? snapshot.covered_ids.map((id) => id >>> 0)
				: Array.isArray(snapshot.coveredIds)
					? snapshot.coveredIds.map((id) => id >>> 0)
					: [],
		});
	}

	resetCoverage() {
		this.#nativeHarness.resetCoverage();
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
			case EVENT_KIND_LOG:
				return this.#callbacks.log;
			default:
				return null;
		}
	}
}

function createLocalHarness(bytes, options) {
	const artifactOptions = normalizeArtifactOptions(options);
	return new Harness(
		native.createHarness(
			toWasmBytes(bytes),
			artifactOptions.projectRoot,
			artifactOptions.sourceFileFallback,
			artifactOptions.updateSnapshots,
		),
	);
}

function createHarness(bytes, options = {}) {
	const wasmBytes = toWasmBytes(bytes);
	const artifactOptions = normalizeArtifactOptions(options);
	return decorateHarness(createLocalHarness(wasmBytes, options), {
		bytes: wasmBytes,
		createLocalHarness,
		createHarnessOptions: options,
		runInBand: artifactOptions.updateSnapshots === true,
		workerModulePath: __filename,
	});
}

module.exports = {
	createHarness,
};
