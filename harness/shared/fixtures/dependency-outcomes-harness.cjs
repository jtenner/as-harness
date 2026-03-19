"use strict";

const NODE_KIND_TEST = 1;
const DECLARATION_MODE_NORMAL = 1;
const FAILURE_KIND_ASSERTION = 1;
const NODE_METADATA_BY_INDEX = new Map([
	["0", { nodeId: 1, parentNodeId: 0, declarationOrder: 0 }],
	[
		"1",
		{ nodeId: 2, parentNodeId: 0, declarationOrder: 1, dependencyNodeIds: [1] },
	],
	[
		"2",
		{ nodeId: 3, parentNodeId: 0, declarationOrder: 2, expectFailure: true },
	],
	[
		"3",
		{ nodeId: 4, parentNodeId: 0, declarationOrder: 3, dependencyNodeIds: [3] },
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
				this.#emitNode([0], NODE_KIND_TEST, "failing prereq");
				this.#emitNode([1], NODE_KIND_TEST, "blocked by failing prereq");
				this.#emitNode([2], NODE_KIND_TEST, "expected failure prereq");
				this.#emitNode([3], NODE_KIND_TEST, "depends on expected failure");
				return true;
			case "0":
			case "1":
			case "2":
			case "3":
				return false;
			default:
				return true;
		}
	}

	run(nodeIndex) {
		const normalizedNodeIndex = Array.isArray(nodeIndex)
			? nodeIndex.slice()
			: [];
		this.#emit("nodeStart", { nodeIndex: normalizedNodeIndex });

		switch (normalizedNodeIndex.join(".")) {
			case "0":
				this.#emit("failMessage", { message: "failing prereq failed" });
				this.#emit("nodeFail", {
					nodeIndex: normalizedNodeIndex,
					failureKind: FAILURE_KIND_ASSERTION,
				});
				return false;
			case "2":
				this.#emit("failMessage", {
					message: "expected failure prereq failed",
				});
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
		const metadata = NODE_METADATA_BY_INDEX.get(nodeIndex.join(".")) ?? {
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
