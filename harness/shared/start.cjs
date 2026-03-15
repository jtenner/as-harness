"use strict";

const os = require("node:os");
const path = require("node:path");
const { Worker } = require("node:worker_threads");

const NODE_KIND_TEST = 1;
const DECLARATION_MODE_NORMAL = 1;
const EVENT_TYPES = [
	["onNodeFound", "nodeFound"],
	["onNodeStart", "nodeStart"],
	["onNodePass", "nodePass"],
	["onFailMessage", "failMessage"],
	["onCallbackStart", "callbackStart"],
	["onCallbackPass", "callbackPass"],
	["onDiagnostic", "diagnostic"],
];
const workerScriptPath = path.join(__dirname, "start-worker.cjs");

function cloneEvent(event) {
	const copy = {};
	for (const [key, value] of Object.entries(event)) {
		copy[key] = Array.isArray(value) ? value.slice() : value;
	}
	return copy;
}

function cloneNode(node) {
	return {
		nodeIndex: Array.isArray(node.nodeIndex) ? node.nodeIndex.slice() : [],
		kind: typeof node.kind === "number" ? node.kind >>> 0 : 0,
		declarationMode:
			typeof node.declarationMode === "number" ? node.declarationMode >>> 0 : 0,
		name: typeof node.name === "string" ? node.name : "",
	};
}

function countTestNodes(nodes) {
	let count = 0;
	for (const node of nodes) {
		if (node.kind === NODE_KIND_TEST) {
			count += 1;
		}
	}
	return count;
}

function listRunnableTests(nodes) {
	return nodes.filter(
		(node) =>
			node.kind === NODE_KIND_TEST &&
			node.declarationMode === DECLARATION_MODE_NORMAL,
	);
}

function discoverImmediateChildren(harness, nodeIndex) {
	const found = [];
	harness.onNodeFound((event) => {
		found.push(cloneNode(event));
	});

	return {
		ok: harness.discover(nodeIndex),
		nodes: found,
	};
}

function discoverBranch(harness, rootNode) {
	const nodes = [cloneNode(rootNode)];
	const queue = [cloneNode(rootNode)];
	let ok = true;

	while (queue.length > 0) {
		const parent = queue.shift();
		const discovered = discoverImmediateChildren(harness, parent.nodeIndex);
		if (!discovered.ok) {
			if (parent.kind === NODE_KIND_TEST) {
				continue;
			}

			ok = false;
			break;
		}

		for (const child of discovered.nodes) {
			nodes.push(child);
			queue.push(child);
		}
	}

	return {
		ok,
		nodes,
		testCount: countTestNodes(nodes),
	};
}

function getWorkerCount(branchCount) {
	if (branchCount === 0) {
		return 0;
	}

	const parallelism =
		typeof os.availableParallelism === "function"
			? os.availableParallelism()
			: os.cpus().length;
	return Math.max(1, Math.min(branchCount, parallelism));
}

function terminateWorkers(workers) {
	return Promise.allSettled(workers.map((worker) => worker.terminate()));
}

async function runTasksInWorkerPool(
	workerModulePath,
	bytes,
	taskType,
	tasks,
	workerCount,
) {
	if (tasks.length === 0 || workerCount === 0) {
		return [];
	}

	return await new Promise((resolve, reject) => {
		const workers = [];
		const results = new Array(tasks.length);
		let nextTaskIndex = 0;
		let completedTaskCount = 0;
		let settled = false;

		const settleError = (error) => {
			if (settled) {
				return;
			}
			settled = true;
			terminateWorkers(workers).finally(() => reject(error));
		};

		const settleSuccess = () => {
			if (settled) {
				return;
			}
			settled = true;
			terminateWorkers(workers).finally(() => resolve(results));
		};

		const assignTask = (worker) => {
			if (settled || nextTaskIndex >= tasks.length) {
				return;
			}

			const taskIndex = nextTaskIndex;
			nextTaskIndex += 1;
			worker.postMessage({
				type: taskType,
				taskIndex,
				task: tasks[taskIndex],
			});
		};

		for (let index = 0; index < workerCount; index += 1) {
			const worker = new Worker(workerScriptPath, {
				workerData: {
					modulePath: workerModulePath,
					bytes: Buffer.from(bytes),
				},
			});
			workers.push(worker);

			worker.on("message", (message) => {
				if (settled || message === null || typeof message !== "object") {
					return;
				}

				if (
					message.type === "taskError" &&
					message.taskType === taskType
				) {
					settleError(new Error(message.error || `${taskType} worker failed`));
					return;
				}

				if (
					message.type !== "taskResult" ||
					message.taskType !== taskType
				) {
					return;
				}

				results[message.taskIndex] = message.result;
				completedTaskCount += 1;

				if (completedTaskCount >= tasks.length) {
					settleSuccess();
					return;
				}

				assignTask(worker);
			});

			worker.on("error", (error) => {
				settleError(error);
			});

			assignTask(worker);
		}
	});
}

async function startHarness(options) {
	const discoveryHarness = options.createLocalHarness(options.bytes);
	const topLevelDiscovery = discoverImmediateChildren(discoveryHarness, []);
	const topLevelNodes = topLevelDiscovery.nodes;
	const branches = topLevelNodes.map((root) => ({
		root,
		discovery: {
			ok: false,
			nodes: [],
			testCount: 0,
		},
		executions: [],
		ok: false,
	}));

	const discoveryWorkers = getWorkerCount(topLevelNodes.length);
	if (discoveryWorkers > 0) {
		const discoveryResults = await runTasksInWorkerPool(
			options.workerModulePath,
			options.bytes,
			"discoverBranch",
			topLevelNodes.map((root) => ({ root })),
			discoveryWorkers,
		);

		for (let index = 0; index < branches.length; index += 1) {
			branches[index].discovery = discoveryResults[index];
		}
	}

	let discoveryOk = topLevelDiscovery.ok;
	for (const branch of branches) {
		if (!branch.discovery.ok) {
			discoveryOk = false;
		}
	}

	let workerCount = 0;
	if (discoveryOk) {
		workerCount = getWorkerCount(branches.length);
	}

	if (workerCount > 0) {
		const executionGroups = await runTasksInWorkerPool(
			options.workerModulePath,
			options.bytes,
			"runBranch",
			branches.map((branch) => ({
				runTargets: listRunnableTests(branch.discovery.nodes),
			})),
			workerCount,
		);

		for (let index = 0; index < branches.length; index += 1) {
			branches[index].executions = executionGroups[index] || [];
		}
	}

	let ok = discoveryOk;
	let discoveredTestCount = 0;
	for (const branch of branches) {
		discoveredTestCount += branch.discovery.testCount;
		branch.ok =
			branch.discovery.ok && branch.executions.every((execution) => execution.ok);
		if (!branch.ok) {
			ok = false;
		}
	}

	return {
		ok,
		discoveryOk,
		discoveredTestCount,
		topLevelNodes,
		workerCount,
		branches,
	};
}

function decorateHarness(harness, options) {
	harness.start = function start() {
		return startHarness({
			bytes: Buffer.from(options.bytes),
			createLocalHarness: options.createLocalHarness,
			workerModulePath: path.resolve(options.workerModulePath),
		});
	};

	return harness;
}

module.exports = {
	cloneEvent,
	discoverBranch,
	decorateHarness,
	EVENT_TYPES,
};