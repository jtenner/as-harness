"use strict";

const { parentPort, workerData } = require("node:worker_threads");
const {
	cloneEvent,
	closeHarness,
	createExecutionRecord,
	discoverBranch,
	EVENT_TYPES,
	readCoverageSnapshot,
} = require("./start.cjs");

if (parentPort === null) {
	throw new Error("start worker requires a parent port");
}

const harnessModule = require(workerData.modulePath);
const wasmBytes = Buffer.from(workerData.bytes);

function runBranch(branch) {
	const harness = harnessModule.createHarness(wasmBytes);
	let currentEvents = null;

	try {
		for (const [registrationName, type] of EVENT_TYPES) {
			harness[registrationName]((event) => {
				if (currentEvents === null) {
					return;
				}

				currentEvents.push({
					type,
					data: cloneEvent(event),
				});
			});
		}

		const executions = [];
		for (const node of branch.runTargets) {
			currentEvents = [];
			const rawOk = harness.run(node.nodeIndex);
			executions.push(createExecutionRecord(node, rawOk, currentEvents));
			currentEvents = null;
		}

		return {
			executions,
			coverage: readCoverageSnapshot(harness),
		};
	} finally {
		closeHarness(harness);
	}
}

function runTask(message) {
	switch (message.type) {
		case "discoverBranch": {
			const harness = harnessModule.createHarness(wasmBytes);
			try {
				return discoverBranch(harness, message.task.root);
			} finally {
				closeHarness(harness);
			}
		}
		case "runBranch":
			return runBranch(message.task);
		default:
			return null;
	}
}

parentPort.on("message", (message) => {
	if (message === null || typeof message !== "object") {
		return;
	}

	if (message.type !== "discoverBranch" && message.type !== "runBranch") {
		return;
	}

	try {
		parentPort.postMessage({
			type: "taskResult",
			taskType: message.type,
			taskIndex: message.taskIndex,
			result: runTask(message),
		});
	} catch (error) {
		parentPort.postMessage({
			type: "taskError",
			taskType: message.type,
			taskIndex: message.taskIndex,
			error: error instanceof Error ? error.message : String(error),
		});
	}
});
