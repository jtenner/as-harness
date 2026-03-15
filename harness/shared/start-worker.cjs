"use strict";

const { parentPort, workerData } = require("node:worker_threads");
const { cloneEvent, discoverBranch, EVENT_TYPES } = require("./start.cjs");

if (parentPort === null) {
	throw new Error("start worker requires a parent port");
}

const harnessModule = require(workerData.modulePath);
const wasmBytes = Buffer.from(workerData.bytes);

function runBranch(branch) {
	const harness = harnessModule.createHarness(wasmBytes);
	let currentEvents = null;

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
		const ok = harness.run(node.nodeIndex);
		executions.push({
			node,
			ok,
			events: currentEvents,
		});
		currentEvents = null;
	}

	return executions;
}

function runTask(message) {
	switch (message.type) {
		case "discoverBranch":
			return discoverBranch(harnessModule.createHarness(wasmBytes), message.task.root);
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