"use strict";

const NODE_KIND_TEST = 1;
const NODE_KIND_SUITE = 2;
const DECLARATION_MODE_NORMAL = 1;
const SEQUENCE_MODE_SEQUENTIAL = 1;
const NODE_METADATA_BY_INDEX = new Map([
	["0", { nodeId: 1, parentNodeId: 0, declarationOrder: 0 }],
	["1", { nodeId: 2, parentNodeId: 0, declarationOrder: 1 }],
	[
		"2",
		{
			nodeId: 3,
			parentNodeId: 0,
			declarationOrder: 2,
			sequenceMode: SEQUENCE_MODE_SEQUENTIAL,
		},
	],
	["3", { nodeId: 4, parentNodeId: 0, declarationOrder: 3 }],
	["4", { nodeId: 5, parentNodeId: 0, declarationOrder: 4 }],
	["0.0", { nodeId: 6, parentNodeId: 1, declarationOrder: 5 }],
	["1.0", { nodeId: 7, parentNodeId: 2, declarationOrder: 6 }],
	["2.0", { nodeId: 8, parentNodeId: 3, declarationOrder: 7 }],
	["3.0", { nodeId: 9, parentNodeId: 4, declarationOrder: 8 }],
	["4.0", { nodeId: 10, parentNodeId: 5, declarationOrder: 9 }],
]);

class FakeHarness {
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

	onNodeFound(callback) {
		this.#callbacks.nodeFound = callback;
	}

	onNodeStart(callback) {
		this.#callbacks.nodeStart = callback;
	}

	onNodePass(callback) {
		this.#callbacks.nodePass = callback;
	}

	onNodeFail(callback) {
		this.#callbacks.nodeFail = callback;
	}

	onFailMessage(callback) {
		this.#callbacks.failMessage = callback;
	}

	onCallbackStart(callback) {
		this.#callbacks.callbackStart = callback;
	}

	onCallbackPass(callback) {
		this.#callbacks.callbackPass = callback;
	}

	onCallbackFail(callback) {
		this.#callbacks.callbackFail = callback;
	}

	onDiagnostic(callback) {
		this.#callbacks.diagnostic = callback;
	}

	onLog(callback) {
		this.#callbacks.log = callback;
	}

	close() {}

	getCoverageSnapshot() {
		return null;
	}

	resetCoverage() {}

	discover(nodeIndex) {
		switch (Array.isArray(nodeIndex) ? nodeIndex.join(".") : "<invalid>") {
			case "":
				this.#emitNode([0], NODE_KIND_SUITE, "branch-a");
				this.#emitNode([1], NODE_KIND_SUITE, "branch-b");
				this.#emitNode([2], NODE_KIND_SUITE, "branch-c-sequential");
				this.#emitNode([3], NODE_KIND_SUITE, "branch-d");
				this.#emitNode([4], NODE_KIND_SUITE, "branch-e");
				return true;
			case "0":
				this.#emitNode([0, 0], NODE_KIND_TEST, "branch-a-child");
				return true;
			case "1":
				this.#emitNode([1, 0], NODE_KIND_TEST, "branch-b-child");
				return true;
			case "2":
				this.#emitNode([2, 0], NODE_KIND_TEST, "branch-c-child");
				return true;
			case "3":
				this.#emitNode([3, 0], NODE_KIND_TEST, "branch-d-child");
				return true;
			case "4":
				this.#emitNode([4, 0], NODE_KIND_TEST, "branch-e-child");
				return true;
			case "0.0":
			case "1.0":
			case "2.0":
			case "3.0":
			case "4.0":
				return false;
			default:
				return true;
		}
	}

	run(nodeIndex) {
		const normalizedNodeIndex = Array.isArray(nodeIndex) ? nodeIndex.slice() : [];
		this.#emit("nodeStart", { nodeIndex: normalizedNodeIndex });
		this.#emit("nodePass", { nodeIndex: normalizedNodeIndex });
		return true;
	}

	#emitNode(nodeIndex, kind, name) {
		const metadata =
			NODE_METADATA_BY_INDEX.get(nodeIndex.join(".")) ?? {
				nodeId: 0,
				parentNodeId: 0,
				declarationOrder: 0,
				sequenceMode: 0,
			};
		this.#emit("nodeFound", {
			nodeIndex,
			nodeId: metadata.nodeId,
			parentNodeId: metadata.parentNodeId,
			declarationOrder: metadata.declarationOrder,
			sequenceMode: metadata.sequenceMode ?? 0,
			kind,
			declarationMode: DECLARATION_MODE_NORMAL,
			name,
		});
	}

	#emit(type, event) {
		const callback = this.#callbacks[type];
		if (typeof callback === "function") {
			callback(event);
		}
	}
}

function createHarness() {
	return new FakeHarness();
}

module.exports = {
	createHarness,
};
