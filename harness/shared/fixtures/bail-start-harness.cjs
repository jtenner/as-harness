"use strict";

const NODE_KIND_TEST = 1;
const NODE_KIND_SUITE = 2;
const DECLARATION_MODE_NORMAL = 1;
const FAILURE_KIND_ASSERTION = 1;
const FAILURE_POLICY_BAIL = 2;
const NODE_METADATA_BY_INDEX = new Map([
	[
		"0",
		{
			nodeId: 1,
			parentNodeId: 0,
			declarationOrder: 0,
			preferredFailurePolicy: FAILURE_POLICY_BAIL,
		},
	],
	["1", { nodeId: 2, parentNodeId: 0, declarationOrder: 1 }],
	["0.0", { nodeId: 3, parentNodeId: 1, declarationOrder: 2 }],
	["0.1", { nodeId: 4, parentNodeId: 1, declarationOrder: 3 }],
	["1.0", { nodeId: 5, parentNodeId: 2, declarationOrder: 4 }],
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
				this.#emitNode([0], NODE_KIND_SUITE, "bail root");
				this.#emitNode([1], NODE_KIND_SUITE, "plain root");
				return true;
			case "0":
				this.#emitNode([0, 0], NODE_KIND_TEST, "failing bail child");
				this.#emitNode([0, 1], NODE_KIND_TEST, "bailed sibling");
				return true;
			case "1":
				this.#emitNode([1, 0], NODE_KIND_TEST, "plain ready child");
				return true;
			case "0.0":
			case "0.1":
			case "1.0":
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

		if (normalizedNodeIndex.join(".") === "0.0") {
			this.#emit("failMessage", { message: "bail child failed" });
			this.#emit("nodeFail", {
				nodeIndex: normalizedNodeIndex,
				failureKind: FAILURE_KIND_ASSERTION,
			});
			return false;
		}

		this.#emit("nodePass", { nodeIndex: normalizedNodeIndex });
		return true;
	}

	#emitNode(nodeIndex, kind, name) {
		const metadata = NODE_METADATA_BY_INDEX.get(nodeIndex.join(".")) ?? {
			nodeId: 0,
			parentNodeId: 0,
			declarationOrder: 0,
			preferredRunnerMode: 0,
			preferredFailurePolicy: 0,
		};
		this.#emit("nodeFound", {
			nodeIndex,
			nodeId: metadata.nodeId,
			parentNodeId: metadata.parentNodeId,
			declarationOrder: metadata.declarationOrder,
			sequenceMode: 0,
			preferredRunnerMode: metadata.preferredRunnerMode ?? 0,
			preferredFailurePolicy: metadata.preferredFailurePolicy ?? 0,
			dependencyNodeIds: [],
			only: false,
			expectFailure: false,
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
