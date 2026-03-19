"use strict";

const os = require("node:os");
const path = require("node:path");
const { Worker } = require("node:worker_threads");
const { mergeCoverageSnapshots } = require("./covers.cjs");

const NODE_KIND_TEST = 1;
const DECLARATION_MODE_NORMAL = 1;
const NODE_IDENTITY_KEY = Symbol("nodeIdentityKey");
const NODE_PARENT_IDENTITY_KEY = Symbol("nodeParentIdentityKey");
const SEQUENCE_MODE_SEQUENTIAL = 1;
const EVENT_TYPES = [
	["onNodeFound", "nodeFound"],
	["onNodeStart", "nodeStart"],
	["onNodePass", "nodePass"],
	["onNodeFail", "nodeFail"],
	["onFailMessage", "failMessage"],
	["onCallbackStart", "callbackStart"],
	["onCallbackPass", "callbackPass"],
	["onCallbackFail", "callbackFail"],
	["onDiagnostic", "diagnostic"],
	["onLog", "log"],
];
const workerScriptPath = path.join(__dirname, "start-worker.cjs");

function closeHarness(harness) {
	if (harness && typeof harness.close === "function") {
		harness.close();
	}
}

function readCoverageSnapshot(harness) {
	if (!harness || typeof harness.getCoverageSnapshot !== "function") {
		return null;
	}

	return harness.getCoverageSnapshot();
}

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
		nodeId: typeof node.nodeId === "number" ? node.nodeId >>> 0 : 0,
		parentNodeId:
			typeof node.parentNodeId === "number" ? node.parentNodeId >>> 0 : 0,
		declarationOrder:
			typeof node.declarationOrder === "number"
				? node.declarationOrder >>> 0
				: 0,
		sequenceMode:
			typeof node.sequenceMode === "number" ? node.sequenceMode >>> 0 : 0,
		kind: typeof node.kind === "number" ? node.kind >>> 0 : 0,
		declarationMode:
			typeof node.declarationMode === "number" ? node.declarationMode >>> 0 : 0,
		name: typeof node.name === "string" ? node.name : "",
	};
}

function setNodeIdentity(node, identityKey, parentIdentityKey = "") {
	if (!node || typeof identityKey !== "string" || identityKey.length === 0) {
		return node;
	}

	Object.defineProperty(node, NODE_IDENTITY_KEY, {
		value: identityKey,
		writable: true,
		configurable: true,
		enumerable: false,
	});
	Object.defineProperty(node, NODE_PARENT_IDENTITY_KEY, {
		value:
			typeof parentIdentityKey === "string" && parentIdentityKey.length > 0
				? parentIdentityKey
				: "",
		writable: true,
		configurable: true,
		enumerable: false,
	});
	return node;
}

function createNodeIndexKey(nodeIndex) {
	if (!Array.isArray(nodeIndex) || nodeIndex.length === 0) {
		return "";
	}

	return nodeIndex.map((segment) => segment >>> 0).join(".");
}

function createNodeIdentityKey(node, parentIdentityKey = "") {
	if (node && typeof node.nodeId === "number" && node.nodeId > 0) {
		const localIdentityKey = `id:${node.nodeId >>> 0}`;
		return parentIdentityKey
			? `${parentIdentityKey}/${localIdentityKey}`
			: localIdentityKey;
	}

	const pathIdentityKey = `path:${createNodeIndexKey(node?.nodeIndex)}`;
	return parentIdentityKey
		? `${parentIdentityKey}/${pathIdentityKey}`
		: pathIdentityKey;
}

function getNodeIdentityKey(node) {
	if (
		node &&
		typeof node[NODE_IDENTITY_KEY] === "string" &&
		node[NODE_IDENTITY_KEY].length > 0
	) {
		return node[NODE_IDENTITY_KEY];
	}

	return createNodeIdentityKey(node);
}

function getNodeParentIdentityKey(node) {
	if (
		node &&
		typeof node[NODE_PARENT_IDENTITY_KEY] === "string" &&
		node[NODE_PARENT_IDENTITY_KEY].length > 0
	) {
		return node[NODE_PARENT_IDENTITY_KEY];
	}

	return "";
}

function nodeIndexesEqual(left, right) {
	if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
		return false;
	}

	for (let index = 0; index < left.length; index += 1) {
		if ((left[index] >>> 0) !== (right[index] >>> 0)) {
			return false;
		}
	}

	return true;
}

function compareNodeDeclarationOrder(left, right) {
	const leftOrder =
		typeof left?.declarationOrder === "number" ? left.declarationOrder >>> 0 : 0;
	const rightOrder =
		typeof right?.declarationOrder === "number" ? right.declarationOrder >>> 0 : 0;
	if (leftOrder !== rightOrder) {
		return leftOrder - rightOrder;
	}

	const leftId = typeof left?.nodeId === "number" ? left.nodeId >>> 0 : 0;
	const rightId = typeof right?.nodeId === "number" ? right.nodeId >>> 0 : 0;
	if (leftId !== rightId) {
		return leftId - rightId;
	}

	return createNodeIndexKey(left?.nodeIndex).localeCompare(
		createNodeIndexKey(right?.nodeIndex),
	);
}

function uniqueNodesByIdentity(nodes) {
	const dedupedNodes = [];
	const seen = new Set();

	for (const node of nodes) {
		const key = getNodeIdentityKey(node);
		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		dedupedNodes.push(node);
	}

	return dedupedNodes;
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
	return uniqueNodesByIdentity(nodes)
		.filter(
			(node) =>
				node.kind === NODE_KIND_TEST &&
				node.declarationMode === DECLARATION_MODE_NORMAL,
		)
		.sort(compareNodeDeclarationOrder);
}

function discoverImmediateChildren(harness, nodeIndex, parentIdentityKey = "") {
	const found = [];
	harness.onNodeFound((event) => {
		const node = cloneNode(event);
		setNodeIdentity(
			node,
			createNodeIdentityKey(node, parentIdentityKey),
			parentIdentityKey,
		);
		if (nodeIndexesEqual(node.nodeIndex, nodeIndex)) {
			return;
		}

		found.push(node);
	});

	return {
		ok: harness.discover(nodeIndex),
		nodes: uniqueNodesByIdentity(found).sort(compareNodeDeclarationOrder),
	};
}

function discoverBranch(harness, rootNode) {
	const branchRoot = setNodeIdentity(
		cloneNode(rootNode),
		getNodeIdentityKey(rootNode),
		getNodeParentIdentityKey(rootNode),
	);
	const nodes = [branchRoot];
	const queue = [branchRoot];
	const seenNodeKeys = new Set([getNodeIdentityKey(branchRoot)]);
	let ok = true;

	while (queue.length > 0) {
		const parent = queue.shift();
		const discovered = discoverImmediateChildren(
			harness,
			parent.nodeIndex,
			getNodeIdentityKey(parent),
		);
		if (!discovered.ok) {
			if (parent.kind === NODE_KIND_TEST) {
				continue;
			}

			ok = false;
			break;
		}

		for (const child of discovered.nodes) {
			const key = getNodeIdentityKey(child);
			if (seenNodeKeys.has(key)) {
				continue;
			}

			seenNodeKeys.add(key);
			nodes.push(child);
			queue.push(child);
		}
	}

	return {
		ok,
		nodes: nodes.slice().sort(compareNodeDeclarationOrder),
		testCount: countTestNodes(nodes),
	};
}

function createNodeMapByIdentity(nodes) {
	const nodeMap = new Map();
	for (const node of nodes) {
		nodeMap.set(getNodeIdentityKey(node), node);
	}
	return nodeMap;
}

function nodeHasSequentialAncestors(node, nodeMap) {
	let cursor = node;
	while (cursor) {
		if ((cursor.sequenceMode >>> 0) === SEQUENCE_MODE_SEQUENTIAL) {
			return true;
		}

		const parentIdentityKey = getNodeParentIdentityKey(cursor);
		if (!parentIdentityKey) {
			return false;
		}

		cursor = nodeMap.get(parentIdentityKey) ?? null;
	}

	return false;
}

function branchRequiresSequentialExecution(branch) {
	const runnableTests = listRunnableTests(branch.discovery.nodes);
	if (runnableTests.length === 0) {
		return false;
	}

	const nodeMap = createNodeMapByIdentity(branch.discovery.nodes);
	for (const node of runnableTests) {
		if (nodeHasSequentialAncestors(node, nodeMap)) {
			return true;
		}
	}

	return false;
}

function requiresSequentialExecution(branches) {
	for (const branch of branches) {
		if (branchRequiresSequentialExecution(branch)) {
			return true;
		}
	}

	return false;
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
	let topLevelDiscovery;
	let initialCoverage = null;
	let topLevelNodes = [];
	let branches = [];

	try {
		topLevelDiscovery = discoverImmediateChildren(discoveryHarness, []);
		topLevelNodes = uniqueNodesByIdentity(topLevelDiscovery.nodes).sort(
			compareNodeDeclarationOrder,
		);
		branches = topLevelNodes.map((root) => ({
			root,
			discovery: {
				ok: false,
				nodes: [],
				testCount: 0,
			},
			executions: [],
			ok: false,
		}));

		for (const branch of branches) {
			branch.discovery = discoverBranch(discoveryHarness, branch.root);
		}
		initialCoverage = readCoverageSnapshot(discoveryHarness);
	} finally {
		closeHarness(discoveryHarness);
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
		if (requiresSequentialExecution(branches)) {
			workerCount = workerCount > 0 ? 1 : 0;
		}
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
			const executionGroup = executionGroups[index] || null;
			branches[index].executions = executionGroup?.executions || [];
			branches[index].coverage = executionGroup?.coverage ?? null;
		}
	}

	let ok = discoveryOk;
	let discoveredTestCount = 0;
	const coverageSnapshots = initialCoverage ? [initialCoverage] : [];
	for (const branch of branches) {
		discoveredTestCount += branch.discovery.testCount;
		branch.ok =
			branch.discovery.ok && branch.executions.every((execution) => execution.ok);
		if (!branch.ok) {
			ok = false;
		}
		if (branch.coverage) {
			coverageSnapshots.push(branch.coverage);
		}
		delete branch.coverage;
	}

	return {
		ok,
		discoveryOk,
		discoveredTestCount,
		topLevelNodes,
		workerCount,
		branches,
		coverage:
			coverageSnapshots.length > 0
				? mergeCoverageSnapshots(coverageSnapshots)
				: null,
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
	closeHarness,
	discoverBranch,
	decorateHarness,
	EVENT_TYPES,
	readCoverageSnapshot,
};
