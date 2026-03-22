import { SuiteContext, TestContext } from "../../node_test";
import {
	ArtifactFrameKind,
	getActiveArtifactFrameDepth,
	getActiveArtifactFrameHookKind,
	getActiveArtifactFrameKind,
	getActiveArtifactFrameName,
	getActiveArtifactFrameNodeIndexElement,
	getActiveArtifactFrameNodeIndexLength,
	getActiveArtifactFrameNodeKind,
	getActiveArtifactFrameSourceColumn,
	getActiveArtifactFrameSourceFile,
	getActiveArtifactFrameSourceLine,
	hasActiveArtifactFrame,
	resetArtifactFrameStack,
} from "../../internal/artifact-frame";
import { executeNode } from "../../internal/executor";
import { HookKind, NodeKind } from "../../internal/imports";
import { currentNode, Node } from "../../internal/node";
import {
	discoverChildrenByIndexFrom,
	runNodeByIndexFrom,
} from "../../internal/traversal";

const frameTrace = new Array<string>();

function resetFrameTrace(): void {
	frameTrace.length = 0;
}

function serializeActiveFrameNodeIndex(): string {
	const length = getActiveArtifactFrameNodeIndexLength();
	if (length < 0) {
		return "none";
	}

	let result = "[";
	for (let index = 0; index < length; index++) {
		if (index > 0) {
			result += ",";
		}

		result += getActiveArtifactFrameNodeIndexElement(index).toString();
	}

	return result + "]";
}

function recordActiveFrame(label: string): void {
	frameTrace.push(
		label +
			"|" +
			getActiveArtifactFrameDepth().toString() +
			"|" +
			getActiveArtifactFrameKind().toString() +
			"|" +
			getActiveArtifactFrameNodeKind().toString() +
			"|" +
			getActiveArtifactFrameHookKind().toString() +
			"|" +
			getActiveArtifactFrameName() +
			"|" +
			getActiveArtifactFrameSourceFile() +
			"|" +
			getActiveArtifactFrameSourceLine().toString() +
			"|" +
			getActiveArtifactFrameSourceColumn().toString() +
			"|" +
			serializeActiveFrameNodeIndex(),
	);
}

function assertNoActiveArtifactFrame(): void {
	assert(!hasActiveArtifactFrame());
	assert(getActiveArtifactFrameDepth() == 0);
	assert(getActiveArtifactFrameKind() == ArtifactFrameKind.None);
	assert(getActiveArtifactFrameNodeKind() == 0);
	assert(getActiveArtifactFrameHookKind() == 0);
	assert(getActiveArtifactFrameName() == "");
	assert(getActiveArtifactFrameSourceFile() == "");
	assert(getActiveArtifactFrameSourceLine() == 0);
	assert(getActiveArtifactFrameSourceColumn() == 0);
	assert(getActiveArtifactFrameNodeIndexLength() == -1);
}

function beforeEachRoot(_context: TestContext): void {
	recordActiveFrame("root beforeEach");
}

function beforeEachChild(_context: TestContext): void {
	recordActiveFrame("child beforeEach");
}

function afterEachChild(_context: TestContext): void {
	recordActiveFrame("child afterEach");
}

function afterEachRoot(_context: TestContext): void {
	recordActiveFrame("root afterEach");
}

function executeTrackedTest(_context: TestContext): void {
	recordActiveFrame("child test");
}

function executeTrappedTest(_context: TestContext): void {
	recordActiveFrame("trapped child");
	unreachable();
}

function declareTrackedNestedChildren(_context: SuiteContext): void {
	recordActiveFrame("suite discover");
	const child = currentNode.createChild(NodeKind.Test, "nested");
	child.setTestCallback(executeTrackedTest);
}

function testExecuteNodeTracksArtifactFrames(): void {
	resetArtifactFrameStack();
	resetFrameTrace();
	assertNoActiveArtifactFrame();

	const root = new Node(NodeKind.Describe, "root");
	root.registerHook(HookKind.BeforeEach, beforeEachRoot);
	root.registerHook(HookKind.AfterEach, afterEachRoot);

	const child = root.createChild(NodeKind.Test, "child");
	child.registerHook(HookKind.BeforeEach, beforeEachChild);
	child.registerHook(HookKind.AfterEach, afterEachChild);
	child.setTestCallback(executeTrackedTest);

	assert(executeNode(child));
	assert(frameTrace.length == 5);
	assert(frameTrace[0] == "root beforeEach|1|3|2|2|root||0|0|[]");
	assert(frameTrace[1] == "child beforeEach|1|3|1|2|child||0|0|[0]");
	assert(frameTrace[2] == "child test|1|2|1|0|child||0|0|[0]");
	assert(frameTrace[3] == "child afterEach|1|3|1|3|child||0|0|[0]");
	assert(frameTrace[4] == "root afterEach|1|3|2|3|root||0|0|[]");
	assertNoActiveArtifactFrame();
}

function testReplayDiscoveryTracksArtifactFrames(): void {
	resetArtifactFrameStack();
	resetFrameTrace();
	assertNoActiveArtifactFrame();

	const localRoot = new Node(NodeKind.Root, "local root");
	const suite = localRoot.createChild(NodeKind.Describe, "suite");
	suite.setSuiteCallback(declareTrackedNestedChildren);

	assert(discoverChildrenByIndexFrom(localRoot, [0] as StaticArray<u32>) == 1);
	assert(frameTrace.length == 1);
	assert(frameTrace[0] == "suite discover|1|1|2|0|suite||0|0|[0]");
	assertNoActiveArtifactFrame();

	resetFrameTrace();
	assert(runNodeByIndexFrom(localRoot, [0, 0] as StaticArray<u32>));
	assert(frameTrace.length == 2);
	assert(frameTrace[0] == "suite discover|1|1|2|0|suite||0|0|[0]");
	assert(frameTrace[1] == "child test|1|2|1|0|nested||0|0|[0,0]");
	assertNoActiveArtifactFrame();
}

function testArtifactFramesResetAfterTraps(): void {
	resetArtifactFrameStack();
	resetFrameTrace();
	assertNoActiveArtifactFrame();

	const root = new Node(NodeKind.Describe, "root");
	const trappedChild = root.createChild(NodeKind.Test, "trapped");
	trappedChild.setTestCallback(executeTrappedTest);

	assert(!executeNode(trappedChild));
	assert(frameTrace.length == 1);
	assert(frameTrace[0] == "trapped child|1|2|1|0|trapped||0|0|[0]");
	assertNoActiveArtifactFrame();

	resetFrameTrace();
	const plainChild = root.createChild(NodeKind.Test, "plain");
	plainChild.setTestCallback(executeTrackedTest);
	assert(executeNode(plainChild));
	assert(frameTrace.length == 1);
	assert(frameTrace[0] == "child test|1|2|1|0|plain||0|0|[1]");
	assertNoActiveArtifactFrame();
}

testExecuteNodeTracksArtifactFrames();
testReplayDiscoveryTracksArtifactFrames();
testArtifactFramesResetAfterTraps();
