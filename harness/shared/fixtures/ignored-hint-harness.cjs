"use strict";

const NODE_KIND_TEST = 1;
const NODE_KIND_SUITE = 2;
const DECLARATION_MODE_NORMAL = 1;

const NODE_METADATA_BY_INDEX = new Map([
	[
		"0",
		{
			nodeId: 1,
			parentNodeId: 0,
			declarationOrder: 0,
			preferredRunnerMode: 9,
		},
	],
	[
		"0.0",
		{
			nodeId: 2,
			parentNodeId: 1,
			declarationOrder: 1,
			preferredFailurePolicy: 7,
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
				this.#emitNode([0], NODE_KIND_SUITE, "ignored hint suite");
				return true;
			case "0":
				this.#emitNode([0, 0], NODE_KIND_TEST, "ignored hint child");
				return true;
			case "0.0":
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
