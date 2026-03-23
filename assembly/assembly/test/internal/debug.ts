import {
	ArtifactFrameKind,
	ArtifactFrameSnapshot,
	getActiveArtifactFrameSnapshots,
	popArtifactFrame,
	pushHookArtifactFrame,
	pushNodeArtifactFrame,
	recordActiveArtifactFrameSource,
	resetArtifactFrameStack,
} from "../../internal/artifact-frame";
import { serializeDebug } from "../../internal/events";
import { HookKind, NodeKind, DebugSourceKind } from "../../internal/imports";
import { Node } from "../../internal/node";

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

function assertF64(
	actual: StaticArray<u8>,
	offset: usize,
	expected: f64,
): void {
	assert(load<f64>(changetype<usize>(actual) + offset) == expected);
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

	for (let index: u32 = 0; index < expectedLength; index++) {
		assert(
			load<u8>(actualStart + <usize>index) ==
				load<u8>(expectedStart + <usize>index),
		);
	}
}

function testActiveArtifactFrameSnapshotsCloneTheStack(): void {
	resetArtifactFrameStack();

	const root = new Node(NodeKind.Describe, "root");
	const child = root.createChild(NodeKind.Test, "child");
	pushNodeArtifactFrame(root, [] as StaticArray<u32>);
	recordActiveArtifactFrameSource("root.ts", 1, 2);
	pushHookArtifactFrame(child, HookKind.BeforeEach, [0] as StaticArray<u32>);
	recordActiveArtifactFrameSource("child.ts", 3, 4);

	const snapshots = getActiveArtifactFrameSnapshots();
	assert(snapshots.length == 2);

	const rootSnapshot = unchecked(snapshots[0]);
	assert(rootSnapshot.kind == ArtifactFrameKind.Suite);
	assert(rootSnapshot.nodeKind == NodeKind.Describe);
	assert(rootSnapshot.hookKind == 0);
	assert(rootSnapshot.name == "root");
	assert(rootSnapshot.sourceFile == "root.ts");
	assert(rootSnapshot.sourceLine == 1);
	assert(rootSnapshot.sourceColumn == 2);
	assert(rootSnapshot.nodeIndex.length == 0);

	const hookSnapshot = unchecked(snapshots[1]);
	assert(hookSnapshot.kind == ArtifactFrameKind.Hook);
	assert(hookSnapshot.nodeKind == NodeKind.Test);
	assert(hookSnapshot.hookKind == HookKind.BeforeEach);
	assert(hookSnapshot.name == "child");
	assert(hookSnapshot.sourceFile == "child.ts");
	assert(hookSnapshot.sourceLine == 3);
	assert(hookSnapshot.sourceColumn == 4);
	assert(hookSnapshot.nodeIndex.length == 1);
	assert(hookSnapshot.nodeIndex[0] == 0);

	unchecked((hookSnapshot.nodeIndex[0] = 9));
	const preserved = getActiveArtifactFrameSnapshots();
	assert(unchecked(unchecked(preserved[1]).nodeIndex[0]) == 0);

	popArtifactFrame();
	popArtifactFrame();
	resetArtifactFrameStack();
}

function testSerializeDebugPreservesValuesAndCrumbs(): void {
	const crumbs = [
		new ArtifactFrameSnapshot(
			ArtifactFrameKind.Test,
			NodeKind.Test,
			0,
			"child",
			[0, 1] as StaticArray<u32>,
			"child.ts",
			7,
			8,
		),
	] as Array<ArtifactFrameSnapshot>;
	const payload = serializeDebug(
		DebugSourceKind.Trace,
		[11.0, 12.5],
		"trace payload",
		"location.ts",
		21,
		22,
		crumbs,
	);

	assert(payload.length == 113);
	assertByte(payload, 0, <u8>DebugSourceKind.Trace);
	assertByte(payload, 1, 0);
	assertByte(payload, 2, 0);
	assertByte(payload, 3, 0);
	assertU32(payload, 4, 2);
	assertF64(payload, 8, 11.0);
	assertF64(payload, 16, 12.5);
	assertU32(payload, 24, 1);
	assertByte(payload, 28, <u8>ArtifactFrameKind.Test);
	assertByte(payload, 29, <u8>NodeKind.Test);
	assertByte(payload, 30, 0);
	assertByte(payload, 31, 0);
	assertU32(payload, 32, 2);
	assertU32(payload, 36, 0);
	assertU32(payload, 40, 1);
	assertU32(payload, 44, 5);
	assertUtf8Bytes(payload, 48, "child");
	assertU32(payload, 53, 8);
	assertUtf8Bytes(payload, 57, "child.ts");
	assertU32(payload, 65, 7);
	assertU32(payload, 69, 8);
	assertU32(payload, 73, 13);
	assertUtf8Bytes(payload, 77, "trace payload");
	assertU32(payload, 90, 11);
	assertUtf8Bytes(payload, 94, "location.ts");
	assertU32(payload, 105, 21);
	assertU32(payload, 109, 22);
}

testActiveArtifactFrameSnapshotsCloneTheStack();
testSerializeDebugPreservesValuesAndCrumbs();
