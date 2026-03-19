import {
  DeclarationMode,
  EventKind,
  FailureKind,
  HookKind,
  NodeKind,
  writeEvent,
} from "./imports";

export type NodeIndex = StaticArray<u32>;

const U8_BYTE_LENGTH: u32 = sizeof<u8>();
const U32_BYTE_LENGTH: u32 = sizeof<u32>();
const NODE_FOUND_ALIGNMENT_PADDING: u32 = 2;
const CALLBACK_ALIGNMENT_PADDING: u32 = 3;
const FAILURE_ALIGNMENT_PADDING: u32 = 3;
const CALLBACK_FAILURE_ALIGNMENT_PADDING: u32 = 2;

function nodeIndexByteLength(nodeIndex: NodeIndex): u32 {
  return <u32>nodeIndex.length * U32_BYTE_LENGTH;
}

function utf8ByteLength(value: string): u32 {
  return <u32>String.UTF8.byteLength(value);
}

function copyNodeIndexBytes(destination: usize, nodeIndex: NodeIndex): void {
  memory.copy(destination, changetype<usize>(nodeIndex), nodeIndexByteLength(nodeIndex));
}

function copyUtf8Bytes(destination: usize, value: string): void {
  String.UTF8.encodeUnsafe(
    changetype<usize>(value),
    value.length,
    destination,
  );
}

/**
 * Serializes a `NodeFound` payload into the wire-format byte buffer.
 *
 * Payload grammar:
 * `[node_index_length: u32] [node_index: ...bytes] [node_kind: u8]
 * [node_id: u32] [parent_node_id: u32] [declaration_order: u32]
 * [node_kind: u8] [declaration_mode: u8] [2 bytes empty for alignment]
 * [name_byte_length: u32] [name: ...bytes]`
 */
export function serializeNodeFound(
  nodeIndex: NodeIndex,
  nodeId: u32,
  parentNodeId: u32,
  declarationOrder: u32,
  kind: NodeKind,
  mode: DeclarationMode,
  name: string,
): StaticArray<u8> {
  const nodeIndexLength = <u32>nodeIndex.length;
  const nodeIndexBytes = nodeIndexByteLength(nodeIndex);
  const nameBytes = utf8ByteLength(name);
  const totalByteLength =
    U32_BYTE_LENGTH +
    nodeIndexBytes +
    U32_BYTE_LENGTH +
    U32_BYTE_LENGTH +
    U32_BYTE_LENGTH +
    U8_BYTE_LENGTH +
    U8_BYTE_LENGTH +
    NODE_FOUND_ALIGNMENT_PADDING +
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

  store<u16>(payloadStart + offset, 0);
  offset += <usize>NODE_FOUND_ALIGNMENT_PADDING;

  store<u32>(payloadStart + offset, nameBytes);
  offset += <usize>U32_BYTE_LENGTH;

  copyUtf8Bytes(payloadStart + offset, name);

  return payload;
}

/**
 * Serializes a `NodeStart` payload into the wire-format byte buffer.
 *
 * Payload grammar:
 * `[node_index_length: u32] [node_index: ...bytes]`
 */
export function serializeNodeStart(nodeIndex: NodeIndex): StaticArray<u8> {
  const nodeIndexLength = <u32>nodeIndex.length;
  const nodeIndexBytes = nodeIndexByteLength(nodeIndex);
  const totalByteLength =
    U32_BYTE_LENGTH +
    nodeIndexBytes;
  const payload = new StaticArray<u8>(totalByteLength);
  const payloadStart = changetype<usize>(payload);
  let offset: usize = 0;

  store<u32>(payloadStart + offset, nodeIndexLength);
  offset += <usize>U32_BYTE_LENGTH;

  copyNodeIndexBytes(payloadStart + offset, nodeIndex);

  return payload;
}

/**
 * Serializes a `NodePass` payload into the wire-format byte buffer.
 *
 * Payload grammar:
 * `[node_index_length: u32] [node_index: ...bytes]`
 */
export function serializeNodePass(nodeIndex: NodeIndex): StaticArray<u8> {
  const nodeIndexLength = <u32>nodeIndex.length;
  const nodeIndexBytes = nodeIndexByteLength(nodeIndex);
  const totalByteLength =
    U32_BYTE_LENGTH +
    nodeIndexBytes;
  const payload = new StaticArray<u8>(totalByteLength);
  const payloadStart = changetype<usize>(payload);
  let offset: usize = 0;

  store<u32>(payloadStart + offset, nodeIndexLength);
  offset += <usize>U32_BYTE_LENGTH;

  copyNodeIndexBytes(payloadStart + offset, nodeIndex);

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
    U32_BYTE_LENGTH +
    nodeIndexBytes +
    U32_BYTE_LENGTH +
    messageBytes;
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
): StaticArray<u8> {
  const nodeIndexLength = <u32>nodeIndex.length;
  const nodeIndexBytes = nodeIndexByteLength(nodeIndex);
  const totalByteLength =
    U8_BYTE_LENGTH +
    CALLBACK_ALIGNMENT_PADDING +
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
): StaticArray<u8> {
  const nodeIndexLength = <u32>nodeIndex.length;
  const nodeIndexBytes = nodeIndexByteLength(nodeIndex);
  const totalByteLength =
    U8_BYTE_LENGTH +
    CALLBACK_ALIGNMENT_PADDING +
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

  copyNodeIndexBytes(payloadStart + offset, nodeIndex);

  return payload;
}

export function serializeNodeFail(
  nodeIndex: NodeIndex,
  failureKind: FailureKind,
): StaticArray<u8> {
  const nodeIndexLength = <u32>nodeIndex.length;
  const nodeIndexBytes = nodeIndexByteLength(nodeIndex);
  const totalByteLength =
    U8_BYTE_LENGTH +
    FAILURE_ALIGNMENT_PADDING +
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

  copyNodeIndexBytes(payloadStart + offset, nodeIndex);

  return payload;
}

export function serializeCallbackFail(
  hook: HookKind,
  nodeIndex: NodeIndex,
  failureKind: FailureKind,
): StaticArray<u8> {
  const nodeIndexLength = <u32>nodeIndex.length;
  const nodeIndexBytes = nodeIndexByteLength(nodeIndex);
  const totalByteLength =
    U8_BYTE_LENGTH +
    U8_BYTE_LENGTH +
    CALLBACK_FAILURE_ALIGNMENT_PADDING +
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

  copyNodeIndexBytes(payloadStart + offset, nodeIndex);

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
      name,
    ),
  );
}

/**
 * Emits a `NodeStart` event.
 */
export function nodeStart(nodeIndex: NodeIndex): void {
  sendEvent(EventKind.NodeStart, serializeNodeStart(nodeIndex));
}

/**
 * Emits a `NodePass` event.
 */
export function nodePass(nodeIndex: NodeIndex): void {
  sendEvent(EventKind.NodePass, serializeNodePass(nodeIndex));
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
export function diagnostic(
  nodeIndex: NodeIndex,
  message: string,
): void {
  sendEvent(EventKind.Diagnostic, serializeDiagnostic(nodeIndex, message));
}

/**
 * Emits a `CallbackStart` event.
 */
export function callbackStart(
  hook: HookKind,
  nodeIndex: NodeIndex,
): void {
  sendEvent(EventKind.CallbackStart, serializeCallbackStart(hook, nodeIndex));
}

/**
 * Emits a `CallbackPass` event.
 */
export function callbackPass(
  hook: HookKind,
  nodeIndex: NodeIndex,
): void {
  sendEvent(EventKind.CallbackPass, serializeCallbackPass(hook, nodeIndex));
}

export function nodeFail(
  nodeIndex: NodeIndex,
  failureKind: FailureKind,
): void {
  sendEvent(EventKind.NodeFail, serializeNodeFail(nodeIndex, failureKind));
}

export function callbackFail(
  hook: HookKind,
  nodeIndex: NodeIndex,
  failureKind: FailureKind,
): void {
  sendEvent(
    EventKind.CallbackFail,
    serializeCallbackFail(hook, nodeIndex, failureKind),
  );
}
