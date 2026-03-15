"use strict";

const { threadId } = require("node:worker_threads");

const NODE_KIND_TEST = 1;
const NODE_KIND_SUITE = 2;
const DECLARATION_MODE_NORMAL = 1;

class FakeHarness {
	#callbacks = {
		nodeFound: null,
		nodeStart: null,
		nodePass: null,
		failMessage: null,
		callbackStart: null,
		callbackPass: null,
		diagnostic: null,
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

	onFailMessage(callback) {
		this.#callbacks.failMessage = callback;
	}

	onCallbackStart(callback) {
		this.#callbacks.callbackStart = callback;
	}

	onCallbackPass(callback) {
		this.#callbacks.callbackPass = callback;
	}

	onDiagnostic(callback) {
		this.#callbacks.diagnostic = callback;
	}

	discover(nodeIndex) {
		switch (Array.isArray(nodeIndex) ? nodeIndex.join(".") : "<invalid>") {
			case "":
				this.#emitNode([0], NODE_KIND_SUITE, "branch-a");
				this.#emitNode([1], NODE_KIND_SUITE, "branch-b");
				return true;
			case "0":
				this.#emitNode([0, 0], NODE_KIND_TEST, `branch-a-child-thread-${threadId}`);
				return true;
			case "1":
				this.#emitNode([1, 0], NODE_KIND_TEST, `branch-b-child-thread-${threadId}`);
				return true;
			case "0.0":
			case "1.0":
				return false;
			default:
				return true;
		}
	}

	run(nodeIndex) {
		const normalizedNodeIndex = Array.isArray(nodeIndex) ? nodeIndex.slice() : [];
		this.#emit("nodeStart", { nodeIndex: normalizedNodeIndex });
		this.#emit("diagnostic", {
			nodeIndex: normalizedNodeIndex,
			message: `run-thread-${threadId}`,
		});
		this.#emit("nodePass", { nodeIndex: normalizedNodeIndex });
		return true;
	}

	#emitNode(nodeIndex, kind, name) {
		this.#emit("nodeFound", {
			nodeIndex,
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