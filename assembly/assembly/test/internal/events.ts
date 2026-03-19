import {
	serializeCallbackPass,
	serializeCallbackStart,
	serializeDiagnostic,
	serializeFailMessage,
	serializeNodeFound,
	serializeNodePass,
	serializeNodeStart,
} from "../../internal/events";
import {
	DeclarationMode,
	HookKind,
	NodeKind,
	SequenceMode,
} from "../../internal/imports";

function assertByte(
	actual: StaticArray<u8>,
	offset: usize,
	expected: u8,
): void {
	assert(load<u8>(changetype<usize>(actual) + offset) == expected);
}

function assertU32(
	actual: StaticArray<u8>,
	offset: usize,
	expected: u32,
): void {
	assert(load<u32>(changetype<usize>(actual) + offset) == expected);
}

function assertUtf8Bytes(
	actual: StaticArray<u8>,
	offset: usize,
	expected: string,
): void {
	const expectedLength = <u32>String.UTF8.byteLength(expected);
	const expectedBytes = String.UTF8.encode(expected);
	const actualStart = changetype<usize>(actual) + offset;
	const expectedStart = changetype<usize>(expectedBytes);

	for (let i: u32 = 0; i < expectedLength; i++) {
		assert(
			load<u8>(actualStart + <usize>i) == load<u8>(expectedStart + <usize>i),
		);
	}
}

function testSerializeNodeFound(): void {
	const nodeIndex = [3, 5, 8] as StaticArray<u32>;
	const payload = serializeNodeFound(
		nodeIndex,
		21,
		13,
		8,
		NodeKind.Describe,
		DeclarationMode.Todo,
		SequenceMode.Sequential,
		true,
		false,
		[34, 55],
		"alpha",
	);

	assert(payload.length == 57);
	assertU32(payload, 0, 3);
	assertU32(payload, 4, 3);
	assertU32(payload, 8, 5);
	assertU32(payload, 12, 8);
	assertU32(payload, 16, 21);
	assertU32(payload, 20, 13);
	assertU32(payload, 24, 8);
	assertByte(payload, 28, <u8>NodeKind.Describe);
	assertByte(payload, 29, <u8>DeclarationMode.Todo);
	assertByte(payload, 30, <u8>SequenceMode.Sequential);
	assertByte(payload, 31, 1);
	assertByte(payload, 32, 0);
	assertByte(payload, 33, 0);
	assertByte(payload, 34, 0);
	assertByte(payload, 35, 0);
	assertU32(payload, 36, 2);
	assertU32(payload, 40, 34);
	assertU32(payload, 44, 55);
	assertU32(payload, 48, 5);
	assertUtf8Bytes(payload, 52, "alpha");
}

function testSerializeNodeStart(): void {
	const nodeIndex = [13, 21] as StaticArray<u32>;
	const payload = serializeNodeStart(nodeIndex);

	assert(payload.length == 12);
	assertU32(payload, 0, 2);
	assertU32(payload, 4, 13);
	assertU32(payload, 8, 21);
}

function testSerializeNodePass(): void {
	const nodeIndex = [34] as StaticArray<u32>;
	const payload = serializeNodePass(nodeIndex);

	assert(payload.length == 8);
	assertU32(payload, 0, 1);
	assertU32(payload, 4, 34);
}

function testSerializeFailMessage(): void {
	const payload = serializeFailMessage("failure");

	assert(payload.length == 7);
	assertUtf8Bytes(payload, 0, "failure");
}

function testSerializeDiagnostic(): void {
	const nodeIndex = [7, 8] as StaticArray<u32>;
	const payload = serializeDiagnostic(nodeIndex, "note");

	assert(payload.length == 20);
	assertU32(payload, 0, 2);
	assertU32(payload, 4, 7);
	assertU32(payload, 8, 8);
	assertU32(payload, 12, 4);
	assertUtf8Bytes(payload, 16, "note");
}

function testSerializeCallbackStart(): void {
	const nodeIndex = [2, 4, 6] as StaticArray<u32>;
	const payload = serializeCallbackStart(HookKind.AfterEach, nodeIndex);

	assert(payload.length == 20);
	assertByte(payload, 0, <u8>HookKind.AfterEach);
	assertByte(payload, 1, 0);
	assertByte(payload, 2, 0);
	assertByte(payload, 3, 0);
	assertU32(payload, 4, 3);
	assertU32(payload, 8, 2);
	assertU32(payload, 12, 4);
	assertU32(payload, 16, 6);
}

function testSerializeCallbackPass(): void {
	const nodeIndex = [9, 10] as StaticArray<u32>;
	const payload = serializeCallbackPass(HookKind.BeforeEach, nodeIndex);

	assert(payload.length == 16);
	assertByte(payload, 0, <u8>HookKind.BeforeEach);
	assertByte(payload, 1, 0);
	assertByte(payload, 2, 0);
	assertByte(payload, 3, 0);
	assertU32(payload, 4, 2);
	assertU32(payload, 8, 9);
	assertU32(payload, 12, 10);
}

testSerializeNodeFound();
testSerializeNodeStart();
testSerializeNodePass();
testSerializeFailMessage();
testSerializeDiagnostic();
testSerializeCallbackStart();
testSerializeCallbackPass();
