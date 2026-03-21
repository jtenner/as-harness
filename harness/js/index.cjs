"use strict";

const textDecoder = new TextDecoder();
const { createCoverageCollector } = require("../shared/covers.cjs");
const { decorateHarness } = require("../shared/start.cjs");

const HARNESS_MODULE_NAME = "as-harness";
const ABORT_MODULE_NAME = "env";
const COVERS_MODULE_NAME = "__asCovers";
const ALLOCATE_NODE_INDEX_BUFFER_EXPORT = "allocateNodeIndexBuffer";
const DISCOVER_EXPORT = "discover";
const RUN_EXPORT = "run";
const INVOKE_EXPORT = "invoke";
const START_EXPORT = "__start";
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

function isUnreachableTrap(error) {
	return (
		error instanceof WebAssembly.RuntimeError &&
		/unreachable|Unreachable/.test(error.message)
	);
}

function createAbortError(exports, messagePtr, fileNamePtr, line, column) {
	const memory = exports.memory;
	if (!(memory instanceof WebAssembly.Memory)) {
		return new Error(`abort at <unknown>:${line}:${column}`);
	}

	return new Error(
		`abort: ${readAssemblyString(exports, messagePtr)} at ${readAssemblyString(exports, fileNamePtr)}:${line}:${column}`,
	);
}

function readAssemblyString(exports, pointer) {
	if (pointer === 0) {
		return "";
	}

	const memory = exports.memory;
	if (!(memory instanceof WebAssembly.Memory)) {
		return "";
	}

	const utf16 = new Uint16Array(memory.buffer);
	const view = new DataView(memory.buffer);
	const start = pointer >>> 1;
	const byteLength = view.getUint32((pointer >>> 0) - 4, true);
	const length = byteLength >>> 1;
	return String.fromCharCode(...utf16.subarray(start, start + length));
}

function clampTraceValueCount(value) {
	if (!Number.isFinite(value)) {
		return 0;
	}

	return Math.max(0, Math.min(5, value | 0));
}

class Harness {
	#compiledModule;
	#coverage;
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

	constructor(compiledModule) {
		this.#compiledModule = compiledModule;
		this.#coverage = createCoverageCollector();
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

	close() {}

	getCoverageSnapshot() {
		return this.#coverage.snapshot();
	}

	resetCoverage() {
		this.#coverage.reset();
	}

	callI32(exportName) {
		assertExportName(exportName);

		try {
			const exports = this.#instantiate();
			const exported = exports[exportName];
			if (typeof exported !== "function") {
				throw new Error("missing export");
			}

			const result = exported();
			if (typeof result !== "number") {
				throw new Error("invalid result type");
			}

			return result >>> 0;
		} catch {
			throw new Error("failed to call zero-argument i32 export");
		}
	}

	discover(nodeIndex) {
		return this.#callNodeIndexExport(
			DISCOVER_EXPORT,
			nodeIndex,
			(result) => result >= 0,
		);
	}

	run(nodeIndex) {
		return this.#callNodeIndexExport(
			RUN_EXPORT,
			nodeIndex,
			(result) => result === 1,
		);
	}

	#callNodeIndexExport(exportName, nodeIndex, isSuccess) {
		const decodedNodeIndex = this.#normalizeNodeIndex(nodeIndex);
		if (decodedNodeIndex === null) {
			return false;
		}

		try {
			const exports = this.#instantiate();
			this.#stageNodeIndex(exports, decodedNodeIndex);
			const exported = exports[exportName];
			if (typeof exported !== "function") {
				return false;
			}

			const result = exported();
			if (typeof result !== "number") {
				return false;
			}

			return isSuccess(result | 0);
		} catch {
			return false;
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

	#instantiate() {
		let exports = null;
		const instance = new WebAssembly.Instance(this.#compiledModule, {
			[HARNESS_MODULE_NAME]: {
				write_event: (kind, payloadPtr, payloadLen) => {
					if (exports === null) {
						throw new Error("Harness exports are not ready.");
					}

					const callback = this.#callbackForEventKind(kind >>> 0);
					if (callback === null) {
						return;
					}

					const memory = exports.memory;
					if (!(memory instanceof WebAssembly.Memory)) {
						return;
					}

					const payload = new Uint8Array(
						memory.buffer,
						payloadPtr >>> 0,
						payloadLen >>> 0,
					).slice();
					const event = decodeEvent(kind >>> 0, payload);
					if (event !== null) {
						callback(event);
					}
				},
				invoke_staged: () => {
					if (
						exports === null ||
						typeof exports[INVOKE_EXPORT] !== "function"
					) {
						return 0;
					}

					try {
						exports[INVOKE_EXPORT]();
						return 1;
					} catch (error) {
						if (isUnreachableTrap(error)) {
							return 0;
						}

						return 0;
					}
				},
			},
			[COVERS_MODULE_NAME]: {
				coverDeclare: (filePtr, id, line, column, coverType) => {
					if (exports === null) {
						throw new Error("Harness exports are not ready.");
					}

					this.#coverage.declare({
						id: id >>> 0,
						file: readAssemblyString(exports, filePtr >>> 0),
						line: line | 0,
						column: column | 0,
						coverType: coverType >>> 0,
					});
				},
				cover: (id) => {
					this.#coverage.hit(id >>> 0);
				},
			},
			[ABORT_MODULE_NAME]: {
				abort: (messagePtr, fileNamePtr, line, column) => {
					if (exports === null) {
						throw new Error("Harness exports are not ready.");
					}

					throw createAbortError(
						exports,
						messagePtr >>> 0,
						fileNamePtr >>> 0,
						line | 0,
						column | 0,
					);
				},
				trace: (messagePtr, n, a0, a1, a2, a3, a4) => {
					if (exports === null) {
						throw new Error("Harness exports are not ready.");
					}

					const callback = this.#callbacks.log;
					if (callback === null) {
						return;
					}

					callback({
						message: readAssemblyString(exports, messagePtr >>> 0),
						source: "trace",
						values: [a0, a1, a2, a3, a4].slice(0, clampTraceValueCount(n)),
					});
				},
			},
		});

		exports = instance.exports;
		if (typeof exports[START_EXPORT] === "function") {
			exports[START_EXPORT]();
		}

		return exports;
	}

	#stageNodeIndex(exports, nodeIndex) {
		const allocateBuffer = exports[ALLOCATE_NODE_INDEX_BUFFER_EXPORT];
		if (typeof allocateBuffer !== "function") {
			throw new Error("missing allocateNodeIndexBuffer export");
		}

		const memory = exports.memory;
		if (!(memory instanceof WebAssembly.Memory)) {
			throw new Error("missing memory export");
		}

		const pointer = allocateBuffer(nodeIndex.length);
		if (typeof pointer !== "number") {
			throw new Error("invalid node index buffer pointer");
		}

		const view = new DataView(memory.buffer);
		for (let index = 0; index < nodeIndex.length; index += 1) {
			view.setUint32(
				(pointer >>> 0) + index * UINT32_BYTE_LENGTH,
				nodeIndex[index],
				true,
			);
		}
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

function createHarness(bytes) {
	const wasmBytes = toWasmBytes(bytes);
	const compiledModule = new WebAssembly.Module(wasmBytes);
	return decorateHarness(new Harness(compiledModule), {
		bytes: wasmBytes,
		createLocalHarness,
		runInBand: false,
		workerModulePath: __filename,
	});
}

function createLocalHarness(bytes) {
	return new Harness(new WebAssembly.Module(toWasmBytes(bytes)));
}

module.exports = {
	createHarness,
};
