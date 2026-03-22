import { HookKind, NodeKind } from "./imports";
import { Node } from "./node";

export const enum ArtifactFrameKind {
	None = 0,
	Suite = 1,
	Test = 2,
	Hook = 3,
}

class ArtifactFrame {
	readonly kind: ArtifactFrameKind;
	readonly nodeKind: NodeKind;
	readonly hookKind: HookKind;
	readonly name: string;
	readonly sourceFile: string;
	readonly sourceLine: i32;
	readonly sourceColumn: i32;
	private readonly nodeIndexValue: StaticArray<u32>;

	constructor(
		kind: ArtifactFrameKind,
		nodeKind: NodeKind,
		hookKind: HookKind,
		name: string,
		nodeIndex: StaticArray<u32> | null = null,
		sourceFile: string = "",
		sourceLine: i32 = 0,
		sourceColumn: i32 = 0,
	) {
		this.kind = kind;
		this.nodeKind = nodeKind;
		this.hookKind = hookKind;
		this.name = name;
		this.sourceFile = sourceFile;
		this.sourceLine = sourceLine;
		this.sourceColumn = sourceColumn;
		this.nodeIndexValue = cloneNodeIndex(nodeIndex);
	}

	getNodeIndexLength(): i32 {
		return this.nodeIndexValue.length;
	}

	getNodeIndexElement(index: i32): u32 {
		return unchecked(this.nodeIndexValue[index]);
	}
}

const activeArtifactFrames = new Array<ArtifactFrame>();

function cloneNodeIndex(
	nodeIndex: StaticArray<u32> | null = null,
): StaticArray<u32> {
	if (nodeIndex === null) {
		return [] as StaticArray<u32>;
	}

	const clone = new StaticArray<u32>(nodeIndex.length);
	for (let index = 0, length = nodeIndex.length; index < length; index++) {
		unchecked((clone[index] = unchecked(nodeIndex[index])));
	}

	return clone;
}

function currentArtifactFrame(): ArtifactFrame | null {
	const depth = activeArtifactFrames.length;
	return depth > 0 ? unchecked(activeArtifactFrames[depth - 1]) : null;
}

function artifactFrameKindForNode(node: Node): ArtifactFrameKind {
	return node.kind == NodeKind.Test
		? ArtifactFrameKind.Test
		: ArtifactFrameKind.Suite;
}

export function resetArtifactFrameStack(): void {
	activeArtifactFrames.length = 0;
}

export function pushNodeArtifactFrame(
	node: Node,
	nodeIndex: StaticArray<u32> | null = null,
): void {
	activeArtifactFrames.push(
		new ArtifactFrame(
			artifactFrameKindForNode(node),
			node.kind,
			0,
			node.name,
			nodeIndex,
		),
	);
}

export function pushHookArtifactFrame(
	node: Node,
	hookKind: HookKind,
	nodeIndex: StaticArray<u32> | null = null,
): void {
	activeArtifactFrames.push(
		new ArtifactFrame(
			ArtifactFrameKind.Hook,
			node.kind,
			hookKind,
			node.name,
			nodeIndex,
		),
	);
}

export function popArtifactFrame(): void {
	if (activeArtifactFrames.length == 0) {
		return;
	}

	activeArtifactFrames.pop();
}

export function hasActiveArtifactFrame(): bool {
	return currentArtifactFrame() !== null;
}

export function getActiveArtifactFrameDepth(): i32 {
	return activeArtifactFrames.length;
}

export function getActiveArtifactFrameKind(): i32 {
	const frame = currentArtifactFrame();
	return frame === null ? 0 : frame.kind;
}

export function getActiveArtifactFrameNodeKind(): i32 {
	const frame = currentArtifactFrame();
	return frame === null ? 0 : frame.nodeKind;
}

export function getActiveArtifactFrameHookKind(): i32 {
	const frame = currentArtifactFrame();
	return frame === null ? 0 : frame.hookKind;
}

export function getActiveArtifactFrameName(): string {
	const frame = currentArtifactFrame();
	return frame === null ? "" : frame.name;
}

export function getActiveArtifactFrameSourceFile(): string {
	const frame = currentArtifactFrame();
	return frame === null ? "" : frame.sourceFile;
}

export function getActiveArtifactFrameSourceLine(): i32 {
	const frame = currentArtifactFrame();
	return frame === null ? 0 : frame.sourceLine;
}

export function getActiveArtifactFrameSourceColumn(): i32 {
	const frame = currentArtifactFrame();
	return frame === null ? 0 : frame.sourceColumn;
}

export function getActiveArtifactFrameNodeIndexLength(): i32 {
	const frame = currentArtifactFrame();
	return frame === null ? -1 : frame.getNodeIndexLength();
}

export function getActiveArtifactFrameNodeIndexElement(index: i32): u32 {
	const frame = currentArtifactFrame();
	return frame === null ? 0 : frame.getNodeIndexElement(index);
}
