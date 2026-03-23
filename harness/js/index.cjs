"use strict";

const textDecoder = new TextDecoder();
const { createCoverageCollector } = require("../shared/covers.cjs");
const { decorateHarness } = require("../shared/start.cjs");
const {
	createSnapshotKey,
	finalizeSnapshotManifest,
	loadSnapshotManifest,
	matchSnapshotEntry,
	readFixtureText,
	upsertSnapshotEntry,
} = require("../shared/snapshots.cjs");

const HARNESS_MODULE_NAME = "as-harness";
const ABORT_MODULE_NAME = "env";
const COVERS_MODULE_NAME = "__asCovers";
const ARTIFACTS_MODULE_NAME = "__asArtifacts";
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
const HOOK_KIND_BEFORE_ALL = 1;
const HOOK_KIND_BEFORE_EACH = 2;
const HOOK_KIND_AFTER_EACH = 3;
const HOOK_KIND_AFTER_ALL = 4;
const ACTIVE_ARTIFACT_FRAME_DEPTH_EXPORT = "getActiveArtifactFrameDepth";
const ACTIVE_ARTIFACT_FRAME_KIND_EXPORT = "getActiveArtifactFrameKind";
const ACTIVE_ARTIFACT_FRAME_NODE_KIND_EXPORT = "getActiveArtifactFrameNodeKind";
const ACTIVE_ARTIFACT_FRAME_HOOK_KIND_EXPORT = "getActiveArtifactFrameHookKind";
const ACTIVE_ARTIFACT_FRAME_NAME_EXPORT = "getActiveArtifactFrameName";
const ACTIVE_ARTIFACT_FRAME_SOURCE_FILE_EXPORT =
	"getActiveArtifactFrameSourceFile";
const ACTIVE_ARTIFACT_FRAME_SOURCE_LINE_EXPORT =
	"getActiveArtifactFrameSourceLine";
const ACTIVE_ARTIFACT_FRAME_SOURCE_COLUMN_EXPORT =
	"getActiveArtifactFrameSourceColumn";
const ACTIVE_ARTIFACT_FRAME_NODE_INDEX_LENGTH_EXPORT =
	"getActiveArtifactFrameNodeIndexLength";
const ACTIVE_ARTIFACT_FRAME_NODE_INDEX_ELEMENT_EXPORT =
	"getActiveArtifactFrameNodeIndexElement";

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

function callI32Export(exports, exportName, ...args) {
	const exported = exports[exportName];
	if (typeof exported !== "function") {
		return null;
	}

	const result = exported(...args);
	return typeof result === "number" ? result | 0 : null;
}

function readActiveArtifactFrame(exports) {
	const depth = callI32Export(exports, ACTIVE_ARTIFACT_FRAME_DEPTH_EXPORT);
	if (depth === null || depth <= 0) {
		return null;
	}

	const kind = callI32Export(exports, ACTIVE_ARTIFACT_FRAME_KIND_EXPORT);
	const nodeKind = callI32Export(
		exports,
		ACTIVE_ARTIFACT_FRAME_NODE_KIND_EXPORT,
	);
	const hookKind = callI32Export(
		exports,
		ACTIVE_ARTIFACT_FRAME_HOOK_KIND_EXPORT,
	);
	const sourceLine = callI32Export(
		exports,
		ACTIVE_ARTIFACT_FRAME_SOURCE_LINE_EXPORT,
	);
	const sourceColumn = callI32Export(
		exports,
		ACTIVE_ARTIFACT_FRAME_SOURCE_COLUMN_EXPORT,
	);
	const nodeIndexLength = callI32Export(
		exports,
		ACTIVE_ARTIFACT_FRAME_NODE_INDEX_LENGTH_EXPORT,
	);
	const namePointer = callI32Export(exports, ACTIVE_ARTIFACT_FRAME_NAME_EXPORT);
	const sourceFilePointer = callI32Export(
		exports,
		ACTIVE_ARTIFACT_FRAME_SOURCE_FILE_EXPORT,
	);
	if (
		kind === null ||
		nodeKind === null ||
		hookKind === null ||
		sourceLine === null ||
		sourceColumn === null ||
		nodeIndexLength === null ||
		namePointer === null ||
		sourceFilePointer === null
	) {
		return null;
	}

	const nodeIndex = [];
	for (let index = 0; index < nodeIndexLength; index += 1) {
		const element = callI32Export(
			exports,
			ACTIVE_ARTIFACT_FRAME_NODE_INDEX_ELEMENT_EXPORT,
			index,
		);
		if (element === null) {
			return null;
		}

		nodeIndex.push(element >>> 0);
	}

	return {
		depth,
		kind,
		nodeKind,
		hookKind,
		name: readAssemblyString(exports, namePointer >>> 0),
		sourceFile: readAssemblyString(exports, sourceFilePointer >>> 0),
		sourceLine,
		sourceColumn,
		nodeIndex,
	};
}

function formatActiveArtifactFrame(frame) {
	return [
		`depth=${frame.depth}`,
		`kind=${frame.kind}`,
		`nodeKind=${frame.nodeKind}`,
		`hookKind=${frame.hookKind}`,
		`name=${frame.name}`,
		`file=${frame.sourceFile}`,
		`line=${frame.sourceLine}`,
		`column=${frame.sourceColumn}`,
		`index=[${frame.nodeIndex.join(",")}]`,
	].join(" ");
}

function normalizeArtifactOptions(createHarnessOptions = {}) {
	const artifactOptions =
		createHarnessOptions &&
		typeof createHarnessOptions === "object" &&
		createHarnessOptions.artifactOptions &&
		typeof createHarnessOptions.artifactOptions === "object"
			? createHarnessOptions.artifactOptions
			: null;
	return {
		projectRoot:
			typeof artifactOptions?.projectRoot === "string"
				? artifactOptions.projectRoot
				: "",
		sourceFiles: Array.isArray(artifactOptions?.sourceFiles)
			? artifactOptions.sourceFiles.filter(
					(value) => typeof value === "string" && value.length > 0,
				)
			: [],
		updateSnapshots: artifactOptions?.updateSnapshots === true,
	};
}

function hookExecutionName(hookKind) {
	switch (hookKind) {
		case HOOK_KIND_BEFORE_ALL:
			return "before hook";
		case HOOK_KIND_BEFORE_EACH:
			return "beforeEach hook";
		case HOOK_KIND_AFTER_EACH:
			return "afterEach hook";
		case HOOK_KIND_AFTER_ALL:
			return "after hook";
		default:
			return "hook";
	}
}

function resolveSnapshotExecutionName(frame, label) {
	if (typeof label === "string" && label.length > 0) {
		return label;
	}
	if (frame && frame.kind === 3) {
		return hookExecutionName(frame.hookKind);
	}
	return typeof frame?.name === "string" ? frame.name : "";
}

function createArtifactInvocationState(artifactOptions) {
	const enabled =
		typeof artifactOptions?.projectRoot === "string" &&
		artifactOptions.projectRoot.length > 0;

	return {
		enabled,
		lastText: "",
		manifest: enabled
			? loadSnapshotManifest(artifactOptions.projectRoot)
			: null,
		occurrencesByExecutionKey: new Map(),
		projectRoot: enabled ? artifactOptions.projectRoot : "",
		sourceFileFallback:
			Array.isArray(artifactOptions?.sourceFiles) &&
			artifactOptions.sourceFiles.length === 1
				? artifactOptions.sourceFiles[0]
				: "",
		updateSnapshots: artifactOptions?.updateSnapshots === true,
	};
}

function normalizeArtifactSourceFile(projectRoot, sourceFile) {
	if (typeof sourceFile !== "string" || sourceFile.length === 0) {
		return "";
	}

	if (path.isAbsolute(sourceFile)) {
		const relativePath = sourceFile
			? path.relative(projectRoot, sourceFile).replaceAll("\\", "/")
			: "";
		if (
			relativePath.length > 0 &&
			relativePath !== "." &&
			!relativePath.startsWith("../") &&
			!path.isAbsolute(relativePath)
		) {
			return relativePath;
		}
	}

	const normalizedSourceFile = sourceFile.replaceAll("\\", "/");
	if (
		normalizedSourceFile === "." ||
		normalizedSourceFile.startsWith("../") ||
		normalizedSourceFile.includes("/../")
	) {
		return path.posix.basename(normalizedSourceFile);
	}

	return normalizedSourceFile;
}

function setArtifactLastText(artifactState, value) {
	artifactState.lastText = typeof value === "string" ? value : "";
}

function writeUtf16ToMemory(memory, destination, value) {
	const view = new DataView(memory.buffer);
	for (let index = 0; index < value.length; index += 1) {
		view.setUint16(
			(destination >>> 0) + index * 2,
			value.charCodeAt(index),
			true,
		);
	}
}

function formatSnapshotCheckFailure(result) {
	switch (result?.outcome) {
		case "missing-snapshot-file":
			return `snapshot missing file: ${result.relativeSnapshotPath} :: ${result.key}`;
		case "missing-snapshot-entry":
			return `snapshot missing entry: ${result.relativeSnapshotPath} :: ${result.key}`;
		case "mismatch":
			return `snapshot mismatch: ${result.relativeSnapshotPath} :: ${result.key}\nexpected: ${result.expectedValue}\nactual: ${result.actualValue}`;
		default:
			return "snapshot comparison failed";
	}
}

function formatSnapshotStaleEntry(entry) {
	return `stale snapshot entry: ${entry.relativeSnapshotPath} :: ${entry.key}`;
}

class Harness {
	#compiledModule;
	#coverage;
	#artifactOptions;
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

	constructor(compiledModule, createHarnessOptions = {}) {
		this.#compiledModule = compiledModule;
		this.#coverage = createCoverageCollector();
		this.#artifactOptions = normalizeArtifactOptions(createHarnessOptions);
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
			const artifactState = createArtifactInvocationState(
				this.#artifactOptions,
			);
			const exports = this.#instantiate(artifactState);
			this.#stageNodeIndex(exports, decodedNodeIndex);
			const exported = exports[exportName];
			if (typeof exported !== "function") {
				return false;
			}

			const result = exported();
			if (typeof result !== "number") {
				return false;
			}

			let ok = isSuccess(result | 0);
			if (exportName === RUN_EXPORT && artifactState.manifest !== null) {
				const finalized = finalizeSnapshotManifest(artifactState.manifest, {
					updateSnapshots: artifactState.updateSnapshots,
				});
				if (!finalized.ok) {
					ok = false;
					const callback = this.#callbacks.failMessage;
					if (typeof callback === "function") {
						for (const entry of finalized.staleEntries) {
							callback({
								message: formatSnapshotStaleEntry(entry),
							});
						}
					}
				}
			}

			return ok;
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

	#instantiate(artifactState = null) {
		const activeArtifactState =
			artifactState === null
				? createArtifactInvocationState(this.#artifactOptions)
				: artifactState;
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
			[ARTIFACTS_MODULE_NAME]: {
				capture_active_frame: () => {
					if (exports === null) {
						throw new Error("Harness exports are not ready.");
					}

					const callback = this.#callbacks.diagnostic;
					if (callback === null) {
						return;
					}

					const frame = readActiveArtifactFrame(exports);
					if (frame === null) {
						return;
					}

					callback({
						nodeIndex: frame.nodeIndex,
						message: formatActiveArtifactFrame(frame),
					});
				},
				snapshot_check: (actualPtr, labelPtr) => {
					if (exports === null) {
						throw new Error("Harness exports are not ready.");
					}

					if (
						!activeArtifactState.enabled ||
						activeArtifactState.manifest === null
					) {
						setArtifactLastText(
							activeArtifactState,
							"snapshot artifacts require a configured project root",
						);
						return 0;
					}

					const frame = readActiveArtifactFrame(exports);
					const normalizedFrameSourceFile =
						frame !== null &&
						typeof frame.sourceFile === "string" &&
						frame.sourceFile.length > 0
							? normalizeArtifactSourceFile(
									activeArtifactState.projectRoot,
									frame.sourceFile,
								)
							: "";
					const sourceFile =
						normalizedFrameSourceFile.length > 0
							? normalizedFrameSourceFile
							: activeArtifactState.sourceFileFallback;
					if (typeof sourceFile !== "string" || sourceFile.length === 0) {
						setArtifactLastText(
							activeArtifactState,
							"snapshot requires an active declaration source file",
						);
						return 0;
					}

					const actualValue = readAssemblyString(exports, actualPtr >>> 0);
					const label = readAssemblyString(exports, labelPtr >>> 0);
					const executionName = resolveSnapshotExecutionName(frame, label);
					if (executionName.length === 0) {
						setArtifactLastText(
							activeArtifactState,
							"snapshot requires a non-empty execution name",
						);
						return 0;
					}

					const occurrenceKey = `${sourceFile}\u0000${executionName}`;
					const occurrence =
						activeArtifactState.occurrencesByExecutionKey.get(occurrenceKey) ??
						0;
					activeArtifactState.occurrencesByExecutionKey.set(
						occurrenceKey,
						occurrence + 1,
					);
					const key = createSnapshotKey(executionName, occurrence);

					if (activeArtifactState.updateSnapshots) {
						upsertSnapshotEntry(
							activeArtifactState.manifest,
							sourceFile,
							key,
							actualValue,
						);
						setArtifactLastText(activeArtifactState, "");
						return 1;
					}

					const result = matchSnapshotEntry(
						activeArtifactState.manifest,
						sourceFile,
						key,
						actualValue,
					);
					if (result.ok) {
						setArtifactLastText(activeArtifactState, "");
						return 1;
					}

					setArtifactLastText(
						activeArtifactState,
						formatSnapshotCheckFailure(result),
					);
					return 0;
				},
				fixture_read: (pathPtr) => {
					if (exports === null) {
						throw new Error("Harness exports are not ready.");
					}

					if (
						!activeArtifactState.enabled ||
						activeArtifactState.projectRoot.length === 0
					) {
						setArtifactLastText(
							activeArtifactState,
							"fixture artifacts require a configured project root",
						);
						return 0;
					}

					const frame = readActiveArtifactFrame(exports);
					const normalizedFrameSourceFile =
						frame !== null &&
						typeof frame.sourceFile === "string" &&
						frame.sourceFile.length > 0
							? normalizeArtifactSourceFile(
									activeArtifactState.projectRoot,
									frame.sourceFile,
								)
							: "";
					const sourceFile =
						normalizedFrameSourceFile.length > 0
							? normalizedFrameSourceFile
							: activeArtifactState.sourceFileFallback;
					if (typeof sourceFile !== "string" || sourceFile.length === 0) {
						setArtifactLastText(
							activeArtifactState,
							"fixture requires an active declaration source file",
						);
						return 0;
					}

					try {
						setArtifactLastText(
							activeArtifactState,
							readFixtureText(
								activeArtifactState.projectRoot,
								sourceFile,
								readAssemblyString(exports, pathPtr >>> 0),
							),
						);
						return 1;
					} catch (error) {
						setArtifactLastText(
							activeArtifactState,
							error instanceof Error ? error.message : String(error),
						);
						return 0;
					}
				},
				get_last_text_utf16_byte_length: () =>
					activeArtifactState.lastText.length * 2,
				copy_last_text_utf16: (destinationPtr) => {
					if (exports === null) {
						throw new Error("Harness exports are not ready.");
					}

					const memory = exports.memory;
					if (!(memory instanceof WebAssembly.Memory)) {
						return;
					}

					writeUtf16ToMemory(
						memory,
						destinationPtr >>> 0,
						activeArtifactState.lastText,
					);
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

function createHarness(bytes, options = {}) {
	const wasmBytes = toWasmBytes(bytes);
	const compiledModule = new WebAssembly.Module(wasmBytes);
	const artifactOptions = normalizeArtifactOptions(options);
	return decorateHarness(new Harness(compiledModule, options), {
		bytes: wasmBytes,
		createLocalHarness,
		createHarnessOptions: options,
		runInBand: artifactOptions.updateSnapshots === true,
		workerModulePath: __filename,
	});
}

function createLocalHarness(bytes, options = {}) {
	return new Harness(new WebAssembly.Module(toWasmBytes(bytes)), options);
}

module.exports = {
	createHarness,
};
