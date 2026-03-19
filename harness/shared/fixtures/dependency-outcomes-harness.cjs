"use strict";

const NODE_KIND_TEST = 1;
const NODE_KIND_SUITE = 2;
const DECLARATION_MODE_NORMAL = 1;
const FAILURE_KIND_ASSERTION = 1;
const NODE_METADATA_BY_INDEX = new Map([
	["0", { nodeId: 1, parentNodeId: 0, declarationOrder: 0 }],
	["1", { nodeId: 2, parentNodeId: 0, declarationOrder: 1 }],
	["2", { nodeId: 3, parentNodeId: 0, declarationOrder: 2 }],
	["3", { nodeId: 4, parentNodeId: 0, declarationOrder: 3 }],
	["0.0", { nodeId: 10, parentNodeId: 1, declarationOrder: 4 }],
	[
		"1.0",
		{
			nodeId: 11,
			parentNodeId: 2,
			declarationOrder: 5,
			dependencyNodeIds: [10],
		},
	],
	[
		"2.0",
		{
			nodeId: 12,
			parentNodeId: 3,
			declarationOrder: 6,
			expectFailure: true,
		},
	],
	[
		"3.0",
		{
			nodeId: 13,
			parentNodeId: 4,
			declarationOrder: 7,
			dependencyNodeIds: [12],
		},
	],
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
				this.#emitNode([0], NODE_KIND_SUITE, "failing prereq branch");
				this.#emitNode([1], NODE_KIND_SUITE, "blocked dependent branch");
				this.#emitNode([2], NODE_KIND_SUITE, "expected failure prereq branch");
				this.#emitNode([3], NODE_KIND_SUITE, "satisfied dependent branch");
				return true;
			case "0":
				this.#emitNode([0, 0], NODE_KIND_TEST, "failing prereq");
				return true;
			case "1":
				this.#emitNode([1, 0], NODE_KIND_TEST, "blocked by failing prereq");
				return true;
			case "2":
				this.#emitNode([2, 0], NODE_KIND_TEST, "expected failure prereq");
				return true;
			case "3":
				this.#emitNode([3, 0], NODE_KIND_TEST, "depends on expected failure");
				return true;
			case "0.0":
			case "1.0":
			case "2.0":
			case "3.0":
				return false;
			default:
				return true;
		}
	}

	run(nodeIndex) {
		const normalizedNodeIndex = Array.isArray(nodeIndex) ? nodeIndex.slice() : [];
		this.#emit("nodeStart", { nodeIndex: normalizedNodeIndex });

		switch (normalizedNodeIndex.join(".")) {
			case "0.0":
				this.#emit("failMessage", { message: "failing prereq failed" });
				this.#emit("nodeFail", {
					nodeIndex: normalizedNodeIndex,
					failureKind: FAILURE_KIND_ASSERTION,
				});
				return false;
			case "2.0":
				this.#emit("failMessage", { message: "expected failure prereq failed" });
				this.#emit("nodeFail", {
					nodeIndex: normalizedNodeIndex,
					failureKind: FAILURE_KIND_ASSERTION,
				});
				return false;
			default:
				this.#emit("nodePass", { nodeIndex: normalizedNodeIndex });
				return true;
		}
	}

	#emitNode(nodeIndex, kind, name) {
		const metadata =
			NODE_METADATA_BY_INDEX.get(nodeIndex.join(".")) ?? {
				nodeId: 0,
				parentNodeId: 0,
				declarationOrder: 0,
				dependencyNodeIds: [],
				expectFailure: false,
			};
		this.#emit("nodeFound", {
			nodeIndex,
			nodeId: metadata.nodeId,
			parentNodeId: metadata.parentNodeId,
			declarationOrder: metadata.declarationOrder,
			sequenceMode: 0,
			dependencyNodeIds: metadata.dependencyNodeIds ?? [],
			only: false,
			expectFailure: metadata.expectFailure ?? false,
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
