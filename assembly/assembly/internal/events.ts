import {
	DebugSourceKind,
	DeclarationMode,
	EventKind,
	FailurePolicyHint,
	FailureKind,
	HookKind,
	NodeKind,
	RunnerModeHint,
	SequenceMode,
	writeEvent,
} from "./imports";
import {
	ArtifactFrameSnapshot,
	getActiveArtifactFrameSnapshots,
} from "./artifact-frame";

export type NodeIndex = StaticArray<u32>;

const U8_BYTE_LENGTH: u32 = sizeof<u8>();
const U32_BYTE_LENGTH: u32 = sizeof<u32>();
const F64_BYTE_LENGTH: u32 = sizeof<f64>();
const CALLBACK_ALIGNMENT_PADDING: u32 = 3;
const FAILURE_ALIGNMENT_PADDING: u32 = 3;
const CALLBACK_FAILURE_ALIGNMENT_PADDING: u32 = 2;

function nodeIndexByteLength(nodeIndex: NodeIndex): u32 {
	return <u32>nodeIndex.length * U32_BYTE_LENGTH;
}

function dependencyNodeIdsByteLength(dependencyNodeIds: Array<u32>): u32 {
	return <u32>dependencyNodeIds.length * U32_BYTE_LENGTH;
}

function f64ValuesByteLength(values: Array<f64>): u32 {
	return <u32>values.length * F64_BYTE_LENGTH;
}

function utf8ByteLength(value: string): u32 {
	return <u32>String.UTF8.byteLength(value);
}

function copyNodeIndexBytes(destination: usize, nodeIndex: NodeIndex): void {
	memory.copy(
		destination,
		changetype<usize>(nodeIndex),
		nodeIndexByteLength(nodeIndex),
	);
}

function copyUtf8Bytes(destination: usize, value: string): void {
	String.UTF8.encodeUnsafe(changetype<usize>(value), value.length, destination);
}

function copyDependencyNodeIdsBytes(
	destination: usize,
	dependencyNodeIds: Array<u32>,
): void {
	for (
		let index: i32 = 0, length = dependencyNodeIds.length;
		index < length;
		index++
	) {
		store<u32>(
			destination + <usize>(<u32>index * U32_BYTE_LENGTH),
			unchecked(dependencyNodeIds[index]),
		);
	}
}

function copyF64ValuesBytes(destination: usize, values: Array<f64>): void {
	for (let index: i32 = 0, length = values.length; index < length; index++) {
		store<f64>(
			destination + <usize>(<u32>index * F64_BYTE_LENGTH),
			unchecked(values[index]),
		);
	}
}

function frameCrumbByteLength(frame: ArtifactFrameSnapshot): u32 {
	const nodeIndexBytes = nodeIndexByteLength(frame.nodeIndex);
	const nameBytes = utf8ByteLength(frame.name);
	const sourceFileBytes = utf8ByteLength(frame.sourceFile);
	return (
		U8_BYTE_LENGTH +
		U8_BYTE_LENGTH +
		U8_BYTE_LENGTH +
		U8_BYTE_LENGTH +
		U32_BYTE_LENGTH +
		nodeIndexBytes +
		U32_BYTE_LENGTH +
		nameBytes +
		U32_BYTE_LENGTH +
		sourceFileBytes +
		U32_BYTE_LENGTH +
		U32_BYTE_LENGTH
	);
}

function frameCrumbsByteLength(frames: Array<ArtifactFrameSnapshot>): u32 {
	let total: u32 = 0;

	for (let index = 0, length = frames.length; index < length; index++) {
		total += frameCrumbByteLength(unchecked(frames[index]));
	}

	return total;
}

function clampDebugLocation(value: i32): u32 {
	return value > 0 ? <u32>value : 0;
}

function copyFrameCrumbBytes(
	destination: usize,
	frame: ArtifactFrameSnapshot,
): u32 {
	const nodeIndexLength = <u32>frame.nodeIndex.length;
	const nodeIndexBytes = nodeIndexByteLength(frame.nodeIndex);
	const nameBytes = utf8ByteLength(frame.name);
	const sourceFileBytes = utf8ByteLength(frame.sourceFile);
	let offset: usize = 0;

	store<u8>(destination + offset, <u8>frame.kind);
	offset += <usize>U8_BYTE_LENGTH;

	store<u8>(destination + offset, <u8>frame.nodeKind);
	offset += <usize>U8_BYTE_LENGTH;

	store<u8>(destination + offset, <u8>frame.hookKind);
	offset += <usize>U8_BYTE_LENGTH;

	store<u8>(destination + offset, 0);
	offset += <usize>U8_BYTE_LENGTH;

	store<u32>(destination + offset, nodeIndexLength);
	offset += <usize>U32_BYTE_LENGTH;

	copyNodeIndexBytes(destination + offset, frame.nodeIndex);
	offset += <usize>nodeIndexBytes;

	store<u32>(destination + offset, nameBytes);
	offset += <usize>U32_BYTE_LENGTH;

	copyUtf8Bytes(destination + offset, frame.name);
	offset += <usize>nameBytes;

	store<u32>(destination + offset, sourceFileBytes);
	offset += <usize>U32_BYTE_LENGTH;

	copyUtf8Bytes(destination + offset, frame.sourceFile);
	offset += <usize>sourceFileBytes;

	store<u32>(destination + offset, clampDebugLocation(frame.sourceLine));
	offset += <usize>U32_BYTE_LENGTH;

	store<u32>(destination + offset, clampDebugLocation(frame.sourceColumn));

	return frameCrumbByteLength(frame);
}

/**
 * Serializes a `NodeFound` payload into the wire-format byte buffer.
 *
 * Payload grammar:
 * `[node_index_length: u32] [node_index: ...bytes]
 * [node_id: u32] [parent_node_id: u32] [declaration_order: u32]
 * [node_kind: u8] [declaration_mode: u8] [sequence_mode: u8]
 * [only: u8] [expect_failure: u8] [preferred_runner_mode: u8]
 * [preferred_failure_policy: u8] [1 byte empty for alignment]
 * [dependency_count: u32] [dependency_node_ids: ...bytes]
 * [name_byte_length: u32] [name: ...bytes]`
 */
export function serializeNodeFound(
	nodeIndex: NodeIndex,
	nodeId: u32,
	parentNodeId: u32,
	declarationOrder: u32,
	kind: NodeKind,
	mode: DeclarationMode,
	sequenceMode: SequenceMode,
	only: bool,
	expectFailure: bool,
	preferredRunnerMode: RunnerModeHint,
	preferredFailurePolicy: FailurePolicyHint,
	dependencyNodeIds: Array<u32>,
	name: string,
): StaticArray<u8> {
	const nodeIndexLength = <u32>nodeIndex.length;
	const nodeIndexBytes = nodeIndexByteLength(nodeIndex);
	const dependencyCount = <u32>dependencyNodeIds.length;
	const dependencyNodeIdsBytes = dependencyNodeIdsByteLength(dependencyNodeIds);
	const nameBytes = utf8ByteLength(name);
	const totalByteLength =
		U32_BYTE_LENGTH +
		nodeIndexBytes +
		U32_BYTE_LENGTH +
		U32_BYTE_LENGTH +
		U32_BYTE_LENGTH +
		U8_BYTE_LENGTH +
		U8_BYTE_LENGTH +
		U8_BYTE_LENGTH +
		U8_BYTE_LENGTH +
		U8_BYTE_LENGTH +
		U8_BYTE_LENGTH +
		U8_BYTE_LENGTH +
		U8_BYTE_LENGTH +
		U32_BYTE_LENGTH +
		dependencyNodeIdsBytes +
		U32_BYTE_LENGTH +
		nameBytes;
	const payload = new StaticArray<u8>(totalByteLength);
	const payloadStart = changetype<usize>(payload);
	let offset: usize = 0;

	store<u32>(payloadStart + offset, nodeIndexLength);
	offset += <usize>U32_BYTE_LENGTH;

	copyNodeIndexBytes(payloadStart + offset, nodeIndex);
	offset += <usize>nodeIndexBytes;

	store<u32>(payloadStart + offset, nodeId);
	offset += <usize>U32_BYTE_LENGTH;

	store<u32>(payloadStart + offset, parentNodeId);
	offset += <usize>U32_BYTE_LENGTH;

	store<u32>(payloadStart + offset, declarationOrder);
	offset += <usize>U32_BYTE_LENGTH;

	store<u8>(payloadStart + offset, <u8>kind);
	offset += <usize>U8_BYTE_LENGTH;

	store<u8>(payloadStart + offset, <u8>mode);
	offset += <usize>U8_BYTE_LENGTH;

	store<u8>(payloadStart + offset, <u8>sequenceMode);
	offset += <usize>U8_BYTE_LENGTH;

	store<u8>(payloadStart + offset, only ? 1 : 0);
	offset += <usize>U8_BYTE_LENGTH;

	store<u8>(payloadStart + offset, expectFailure ? 1 : 0);
	offset += <usize>U8_BYTE_LENGTH;

	store<u8>(payloadStart + offset, <u8>preferredRunnerMode);
	offset += <usize>U8_BYTE_LENGTH;

	store<u8>(payloadStart + offset, <u8>preferredFailurePolicy);
	offset += <usize>U8_BYTE_LENGTH;

	store<u8>(payloadStart + offset, 0);
	offset += <usize>U8_BYTE_LENGTH;

	store<u32>(payloadStart + offset, dependencyCount);
	offset += <usize>U32_BYTE_LENGTH;

	copyDependencyNodeIdsBytes(payloadStart + offset, dependencyNodeIds);
	offset += <usize>dependencyNodeIdsBytes;

	store<u32>(payloadStart + offset, nameBytes);
	offset += <usize>U32_BYTE_LENGTH;

	copyUtf8Bytes(payloadStart + offset, name);

	return payload;
}

/**
 * Serializes a `NodeStart` payload into the wire-format byte buffer.
 *
 * Payload grammar:
 * `[node_index_length: u32] [node_index: ...bytes] [node_id: u32]`
 */
export function serializeNodeStart(
	nodeIndex: NodeIndex,
	nodeId: u32,
): StaticArray<u8> {
	const nodeIndexLength = <u32>nodeIndex.length;
	const nodeIndexBytes = nodeIndexByteLength(nodeIndex);
	const totalByteLength = U32_BYTE_LENGTH + nodeIndexBytes + U32_BYTE_LENGTH;
	const payload = new StaticArray<u8>(totalByteLength);
	const payloadStart = changetype<usize>(payload);
	let offset: usize = 0;

	store<u32>(payloadStart + offset, nodeIndexLength);
	offset += <usize>U32_BYTE_LENGTH;

	copyNodeIndexBytes(payloadStart + offset, nodeIndex);
	offset += <usize>nodeIndexBytes;

	store<u32>(payloadStart + offset, nodeId);

	return payload;
}

/**
 * Serializes a `NodePass` payload into the wire-format byte buffer.
 *
 * Payload grammar:
 * `[node_index_length: u32] [node_index: ...bytes] [node_id: u32]`
 */
export function serializeNodePass(
	nodeIndex: NodeIndex,
	nodeId: u32,
): StaticArray<u8> {
	const nodeIndexLength = <u32>nodeIndex.length;
	const nodeIndexBytes = nodeIndexByteLength(nodeIndex);
	const totalByteLength = U32_BYTE_LENGTH + nodeIndexBytes + U32_BYTE_LENGTH;
	const payload = new StaticArray<u8>(totalByteLength);
	const payloadStart = changetype<usize>(payload);
	let offset: usize = 0;

	store<u32>(payloadStart + offset, nodeIndexLength);
	offset += <usize>U32_BYTE_LENGTH;

	copyNodeIndexBytes(payloadStart + offset, nodeIndex);
	offset += <usize>nodeIndexBytes;

	store<u32>(payloadStart + offset, nodeId);

	return payload;
}

/**
 * Serializes a `FailMessage` payload into the wire-format byte buffer.
 *
 * Payload grammar:
 * `message: utf8`
 */
export function serializeFailMessage(message: string): StaticArray<u8> {
	const messageBytes = utf8ByteLength(message);
	const payload = new StaticArray<u8>(messageBytes);
	copyUtf8Bytes(changetype<usize>(payload), message);
	return payload;
}

/**
 * Serializes a `Diagnostic` payload into the wire-format byte buffer.
 *
 * Payload grammar:
 * `[node_index_length: u32] [node_index: ...bytes] [message_byte_length: u32]
 * [message: ...bytes]`
 */
export function serializeDiagnostic(
	nodeIndex: NodeIndex,
	message: string,
): StaticArray<u8> {
	const nodeIndexLength = <u32>nodeIndex.length;
	const nodeIndexBytes = nodeIndexByteLength(nodeIndex);
	const messageBytes = utf8ByteLength(message);
	const totalByteLength =
		U32_BYTE_LENGTH + nodeIndexBytes + U32_BYTE_LENGTH + messageBytes;
	const payload = new StaticArray<u8>(totalByteLength);
	const payloadStart = changetype<usize>(payload);
	let offset: usize = 0;

	store<u32>(payloadStart + offset, nodeIndexLength);
	offset += <usize>U32_BYTE_LENGTH;

	copyNodeIndexBytes(payloadStart + offset, nodeIndex);
	offset += <usize>nodeIndexBytes;

	store<u32>(payloadStart + offset, messageBytes);
	offset += <usize>U32_BYTE_LENGTH;

	copyUtf8Bytes(payloadStart + offset, message);

	return payload;
}

/**
 * Serializes a `CallbackStart` payload into the wire-format byte buffer.
 *
 * Payload grammar:
 * `[hook: u8] [3 bytes empty for alignment] [node_index_length: u32]
 * [node_index: ...bytes]`
 */
export function serializeCallbackStart(
	hook: HookKind,
	nodeIndex: NodeIndex,
	nodeId: u32,
): StaticArray<u8> {
	const nodeIndexLength = <u32>nodeIndex.length;
	const nodeIndexBytes = nodeIndexByteLength(nodeIndex);
	const totalByteLength =
		U8_BYTE_LENGTH +
		CALLBACK_ALIGNMENT_PADDING +
		U32_BYTE_LENGTH +
		U32_BYTE_LENGTH +
		nodeIndexBytes;
	const payload = new StaticArray<u8>(totalByteLength);
	const payloadStart = changetype<usize>(payload);
	let offset: usize = 0;

	store<u8>(payloadStart + offset, <u8>hook);
	offset += <usize>U8_BYTE_LENGTH;

	store<u8>(payloadStart + offset, 0);
	offset += <usize>U8_BYTE_LENGTH;
	store<u8>(payloadStart + offset, 0);
	offset += <usize>U8_BYTE_LENGTH;
	store<u8>(payloadStart + offset, 0);
	offset += <usize>U8_BYTE_LENGTH;

	store<u32>(payloadStart + offset, nodeIndexLength);
	offset += <usize>U32_BYTE_LENGTH;

	store<u32>(payloadStart + offset, nodeId);
	offset += <usize>U32_BYTE_LENGTH;

	copyNodeIndexBytes(payloadStart + offset, nodeIndex);

	return payload;
}

/**
 * Serializes a `CallbackPass` payload into the wire-format byte buffer.
 *
 * Payload grammar:
 * `[hook: u8] [3 bytes empty for alignment] [node_index_length: u32]
 * [node_index: ...bytes]`
 */
export function serializeCallbackPass(
	hook: HookKind,
	nodeIndex: NodeIndex,
	nodeId: u32,
): StaticArray<u8> {
	const nodeIndexLength = <u32>nodeIndex.length;
	const nodeIndexBytes = nodeIndexByteLength(nodeIndex);
	const totalByteLength =
		U8_BYTE_LENGTH +
		CALLBACK_ALIGNMENT_PADDING +
		U32_BYTE_LENGTH +
		U32_BYTE_LENGTH +
		nodeIndexBytes;
	const payload = new StaticArray<u8>(totalByteLength);
	const payloadStart = changetype<usize>(payload);
	let offset: usize = 0;

	store<u8>(payloadStart + offset, <u8>hook);
	offset += <usize>U8_BYTE_LENGTH;

	store<u8>(payloadStart + offset, 0);
	offset += <usize>U8_BYTE_LENGTH;
	store<u8>(payloadStart + offset, 0);
	offset += <usize>U8_BYTE_LENGTH;
	store<u8>(payloadStart + offset, 0);
	offset += <usize>U8_BYTE_LENGTH;

	store<u32>(payloadStart + offset, nodeIndexLength);
	offset += <usize>U32_BYTE_LENGTH;

	store<u32>(payloadStart + offset, nodeId);
	offset += <usize>U32_BYTE_LENGTH;

	copyNodeIndexBytes(payloadStart + offset, nodeIndex);

	return payload;
}

export function serializeNodeFail(
	nodeIndex: NodeIndex,
	nodeId: u32,
	failureKind: FailureKind,
): StaticArray<u8> {
	const nodeIndexLength = <u32>nodeIndex.length;
	const nodeIndexBytes = nodeIndexByteLength(nodeIndex);
	const totalByteLength =
		U8_BYTE_LENGTH +
		FAILURE_ALIGNMENT_PADDING +
		U32_BYTE_LENGTH +
		U32_BYTE_LENGTH +
		nodeIndexBytes;
	const payload = new StaticArray<u8>(totalByteLength);
	const payloadStart = changetype<usize>(payload);
	let offset: usize = 0;

	store<u8>(payloadStart + offset, <u8>failureKind);
	offset += <usize>U8_BYTE_LENGTH;

	store<u8>(payloadStart + offset, 0);
	offset += <usize>U8_BYTE_LENGTH;
	store<u8>(payloadStart + offset, 0);
	offset += <usize>U8_BYTE_LENGTH;
	store<u8>(payloadStart + offset, 0);
	offset += <usize>U8_BYTE_LENGTH;

	store<u32>(payloadStart + offset, nodeIndexLength);
	offset += <usize>U32_BYTE_LENGTH;

	store<u32>(payloadStart + offset, nodeId);
	offset += <usize>U32_BYTE_LENGTH;

	copyNodeIndexBytes(payloadStart + offset, nodeIndex);

	return payload;
}

export function serializeCallbackFail(
	hook: HookKind,
	nodeIndex: NodeIndex,
	nodeId: u32,
	failureKind: FailureKind,
): StaticArray<u8> {
	const nodeIndexLength = <u32>nodeIndex.length;
	const nodeIndexBytes = nodeIndexByteLength(nodeIndex);
	const totalByteLength =
		U8_BYTE_LENGTH +
		U8_BYTE_LENGTH +
		CALLBACK_FAILURE_ALIGNMENT_PADDING +
		U32_BYTE_LENGTH +
		U32_BYTE_LENGTH +
		nodeIndexBytes;
	const payload = new StaticArray<u8>(totalByteLength);
	const payloadStart = changetype<usize>(payload);
	let offset: usize = 0;

	store<u8>(payloadStart + offset, <u8>hook);
	offset += <usize>U8_BYTE_LENGTH;

	store<u8>(payloadStart + offset, <u8>failureKind);
	offset += <usize>U8_BYTE_LENGTH;

	store<u8>(payloadStart + offset, 0);
	offset += <usize>U8_BYTE_LENGTH;
	store<u8>(payloadStart + offset, 0);
	offset += <usize>U8_BYTE_LENGTH;

	store<u32>(payloadStart + offset, nodeIndexLength);
	offset += <usize>U32_BYTE_LENGTH;

	store<u32>(payloadStart + offset, nodeId);
	offset += <usize>U32_BYTE_LENGTH;

	copyNodeIndexBytes(payloadStart + offset, nodeIndex);

	return payload;
}

/**
 * Serializes a `Debug` payload into the wire-format byte buffer.
 *
 * Payload grammar:
 * `[source_kind: u8] [3 bytes empty for alignment] [value_count: u32]
 * [values: ...f64 bytes] [crumb_count: u32] [crumbs: ...bytes]
 * [message_byte_length: u32] [message: ...bytes]
 * [location_file_byte_length: u32] [location_file: ...bytes]
 * [location_line: u32] [location_column: u32]`
 */
export function serializeDebug(
	source: DebugSourceKind,
	values: Array<f64>,
	message: string,
	locationFile: string = "",
	locationLine: i32 = 0,
	locationColumn: i32 = 0,
	crumbs: Array<ArtifactFrameSnapshot> = getActiveArtifactFrameSnapshots(),
): StaticArray<u8> {
	const valueCount = <u32>values.length;
	const valueBytes = f64ValuesByteLength(values);
	const crumbCount = <u32>crumbs.length;
	const crumbBytes = frameCrumbsByteLength(crumbs);
	const messageBytes = utf8ByteLength(message);
	const locationFileBytes = utf8ByteLength(locationFile);
	const totalByteLength =
		U8_BYTE_LENGTH +
		3 +
		U32_BYTE_LENGTH +
		valueBytes +
		U32_BYTE_LENGTH +
		crumbBytes +
		U32_BYTE_LENGTH +
		messageBytes +
		U32_BYTE_LENGTH +
		locationFileBytes +
		U32_BYTE_LENGTH +
		U32_BYTE_LENGTH;
	const payload = new StaticArray<u8>(totalByteLength);
	const payloadStart = changetype<usize>(payload);
	let offset: usize = 0;

	store<u8>(payloadStart + offset, <u8>source);
	offset += <usize>U8_BYTE_LENGTH;

	store<u8>(payloadStart + offset, 0);
	offset += <usize>U8_BYTE_LENGTH;
	store<u8>(payloadStart + offset, 0);
	offset += <usize>U8_BYTE_LENGTH;
	store<u8>(payloadStart + offset, 0);
	offset += <usize>U8_BYTE_LENGTH;

	store<u32>(payloadStart + offset, valueCount);
	offset += <usize>U32_BYTE_LENGTH;

	copyF64ValuesBytes(payloadStart + offset, values);
	offset += <usize>valueBytes;

	store<u32>(payloadStart + offset, crumbCount);
	offset += <usize>U32_BYTE_LENGTH;

	for (let index = 0, length = crumbs.length; index < length; index++) {
		const frame = unchecked(crumbs[index]);
		offset += <usize>copyFrameCrumbBytes(payloadStart + offset, frame);
	}

	store<u32>(payloadStart + offset, messageBytes);
	offset += <usize>U32_BYTE_LENGTH;

	copyUtf8Bytes(payloadStart + offset, message);
	offset += <usize>messageBytes;

	store<u32>(payloadStart + offset, locationFileBytes);
	offset += <usize>U32_BYTE_LENGTH;

	copyUtf8Bytes(payloadStart + offset, locationFile);
	offset += <usize>locationFileBytes;

	store<u32>(payloadStart + offset, clampDebugLocation(locationLine));
	offset += <usize>U32_BYTE_LENGTH;

	store<u32>(payloadStart + offset, clampDebugLocation(locationColumn));

	return payload;
}

/**
 * Sends a serialized event payload to the imported host event sink.
 */
function sendEvent(kind: EventKind, payload: StaticArray<u8>): void {
	writeEvent(kind, changetype<usize>(payload), <u32>payload.length);
}

/**
 * Emits a `NodeFound` event.
 */
export function nodeFound(
	nodeIndex: NodeIndex,
	nodeId: u32,
	parentNodeId: u32,
	declarationOrder: u32,
	kind: NodeKind,
	mode: DeclarationMode,
	sequenceMode: SequenceMode,
	only: bool,
	expectFailure: bool,
	preferredRunnerMode: RunnerModeHint,
	preferredFailurePolicy: FailurePolicyHint,
	dependencyNodeIds: Array<u32>,
	name: string,
): void {
	sendEvent(
		EventKind.NodeFound,
		serializeNodeFound(
			nodeIndex,
			nodeId,
			parentNodeId,
			declarationOrder,
			kind,
			mode,
			sequenceMode,
			only,
			expectFailure,
			preferredRunnerMode,
			preferredFailurePolicy,
			dependencyNodeIds,
			name,
		),
	);
}

/**
 * Emits a `NodeStart` event.
 */
export function nodeStart(nodeIndex: NodeIndex, nodeId: u32): void {
	sendEvent(EventKind.NodeStart, serializeNodeStart(nodeIndex, nodeId));
}

/**
 * Emits a `NodePass` event.
 */
export function nodePass(nodeIndex: NodeIndex, nodeId: u32): void {
	sendEvent(EventKind.NodePass, serializeNodePass(nodeIndex, nodeId));
}

/**
 * Emits a `FailMessage` event.
 */
export function failMessage(message: string): void {
	sendEvent(EventKind.FailMessage, serializeFailMessage(message));
}

/**
 * Emits a `Diagnostic` event.
 */
export function diagnostic(nodeIndex: NodeIndex, message: string): void {
	sendEvent(EventKind.Diagnostic, serializeDiagnostic(nodeIndex, message));
}

/**
 * Emits a `CallbackStart` event.
 */
export function callbackStart(
	hook: HookKind,
	nodeIndex: NodeIndex,
	nodeId: u32,
): void {
	sendEvent(
		EventKind.CallbackStart,
		serializeCallbackStart(hook, nodeIndex, nodeId),
	);
}

/**
 * Emits a `CallbackPass` event.
 */
export function callbackPass(
	hook: HookKind,
	nodeIndex: NodeIndex,
	nodeId: u32,
): void {
	sendEvent(
		EventKind.CallbackPass,
		serializeCallbackPass(hook, nodeIndex, nodeId),
	);
}

export function nodeFail(
	nodeIndex: NodeIndex,
	nodeId: u32,
	failureKind: FailureKind,
): void {
	sendEvent(
		EventKind.NodeFail,
		serializeNodeFail(nodeIndex, nodeId, failureKind),
	);
}

export function callbackFail(
	hook: HookKind,
	nodeIndex: NodeIndex,
	nodeId: u32,
	failureKind: FailureKind,
): void {
	sendEvent(
		EventKind.CallbackFail,
		serializeCallbackFail(hook, nodeIndex, nodeId, failureKind),
	);
}

export function debug(
	source: DebugSourceKind,
	values: Array<f64>,
	message: string,
	locationFile: string = "",
	locationLine: i32 = 0,
	locationColumn: i32 = 0,
): void {
	sendEvent(
		EventKind.Debug,
		serializeDebug(
			source,
			values,
			message,
			locationFile,
			locationLine,
			locationColumn,
		),
	);
}
