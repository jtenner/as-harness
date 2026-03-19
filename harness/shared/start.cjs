"use strict";

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
		only: node?.only === true,
		expectFailure: node?.expectFailure === true,
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

function createExecutionTarget(branchIndex, executionIndex, node) {
	return {
		branchIndex,
		executionIndex,
		identityKey: getNodeIdentityKey(node),
		node,
	};
}

function listDependencyKeys(node) {
	if (!Array.isArray(node?.dependencyKeys)) {
		return [];
	}

	const dependencyKeys = [];
	const seen = new Set();
	for (const dependencyKey of node.dependencyKeys) {
		if (typeof dependencyKey !== "string" || dependencyKey.length === 0) {
			continue;
		}
		if (seen.has(dependencyKey)) {
			continue;
		}

		seen.add(dependencyKey);
		dependencyKeys.push(dependencyKey);
	}

	return dependencyKeys;
}

function createExecutionTargetMap(branches) {
	const targets = [];
	const targetsByIdentity = new Map();
	const targetsByBranchIndex = new Map();

	for (const branch of branches) {
		const runnableTests = listRunnableTests(branch.discovery.nodes);
		branch.executions = new Array(runnableTests.length);
		const branchTargets = [];

		for (let index = 0; index < runnableTests.length; index += 1) {
			const node = runnableTests[index];
			const target = createExecutionTarget(branch.index, index, node);
			targets.push(target);
			targetsByIdentity.set(target.identityKey, target);
			branchTargets.push(target);
		}

		targetsByBranchIndex.set(branch.index, branchTargets);
	}

	return {
		targets,
		targetsByIdentity,
		targetsByBranchIndex,
	};
}

function isIdentityWithinScope(identityKey, scopeIdentityKey) {
	return (
		identityKey === scopeIdentityKey ||
		identityKey.startsWith(`${scopeIdentityKey}/`)
	);
}

function findNearestRunnableAncestorTarget(target, targetsByIdentity) {
	let parentIdentityKey = getNodeParentIdentityKey(target.node);
	while (parentIdentityKey) {
		const ancestorTarget = targetsByIdentity.get(parentIdentityKey) || null;
		if (ancestorTarget !== null) {
			return ancestorTarget;
		}

		parentIdentityKey = parentIdentityKey.includes("/")
			? parentIdentityKey.slice(0, parentIdentityKey.lastIndexOf("/"))
			: "";
	}

	return null;
}

function collectSequentialScopeTargets(branch, branchTargets) {
	const scopeTargets = [];

	for (const node of branch.discovery.nodes) {
		if ((node.sequenceMode >>> 0) !== SEQUENCE_MODE_SEQUENTIAL) {
			continue;
		}

		const scopeIdentityKey = getNodeIdentityKey(node);
		const targetsInScope = branchTargets
			.filter((target) =>
				isIdentityWithinScope(target.identityKey, scopeIdentityKey),
			)
			.sort(compareExecutionTargets);
		if (targetsInScope.length > 1) {
			scopeTargets.push(targetsInScope);
		}
	}

	return scopeTargets;
}

function addExecutionDependency(adjacency, prereqCounts, fromTarget, toTarget) {
	if (!fromTarget || !toTarget || fromTarget.identityKey === toTarget.identityKey) {
		return;
	}

	let successors = adjacency.get(fromTarget.identityKey) || null;
	if (successors === null) {
		successors = new Set();
		adjacency.set(fromTarget.identityKey, successors);
	}
	if (successors.has(toTarget.identityKey)) {
		return;
	}

	successors.add(toTarget.identityKey);
	prereqCounts.set(
		toTarget.identityKey,
		(prereqCounts.get(toTarget.identityKey) || 0) + 1,
	);
}

function comparePlanIssues(left, right) {
	const leftTarget = left?.targetIdentityKey || "";
	const rightTarget = right?.targetIdentityKey || "";
	if (leftTarget !== rightTarget) {
		return leftTarget.localeCompare(rightTarget);
	}

	const leftDependency = left?.dependencyIdentityKey || "";
	const rightDependency = right?.dependencyIdentityKey || "";
	if (leftDependency !== rightDependency) {
		return leftDependency.localeCompare(rightDependency);
	}

	return (left?.type || "").localeCompare(right?.type || "");
}

function createPlanIssue(type, targetIdentityKey, dependencyIdentityKey = "") {
	return {
		type,
		targetIdentityKey,
		dependencyIdentityKey,
	};
}

function propagateBlockedTargets(initialBlockedKeys, adjacency) {
	const blockedKeys = new Set(initialBlockedKeys);
	const queue = [...blockedKeys];

	while (queue.length > 0) {
		const blockedKey = queue.shift();
		const successors = adjacency.get(blockedKey);
		if (!successors) {
			continue;
		}

		for (const successorKey of successors) {
			if (blockedKeys.has(successorKey)) {
				continue;
			}

			blockedKeys.add(successorKey);
			queue.push(successorKey);
		}
	}

	return blockedKeys;
}

function buildExecutionDependencies(branches, targetsByIdentity, targetsByBranchIndex) {
	const adjacency = new Map();
	const prereqCounts = new Map();
	const blockedKeys = new Set();
	const issues = [];

	for (const target of targetsByIdentity.values()) {
		prereqCounts.set(target.identityKey, 0);
	}

	for (const branch of branches) {
		const branchTargets = targetsByBranchIndex.get(branch.index) || [];
		for (const target of branchTargets) {
			addExecutionDependency(
				adjacency,
				prereqCounts,
				findNearestRunnableAncestorTarget(target, targetsByIdentity),
				target,
			);
		}

		for (const scopeTargets of collectSequentialScopeTargets(branch, branchTargets)) {
			for (let index = 1; index < scopeTargets.length; index += 1) {
				addExecutionDependency(
					adjacency,
					prereqCounts,
					scopeTargets[index - 1],
					scopeTargets[index],
				);
			}
		}
	}

	for (const target of targetsByIdentity.values()) {
		for (const dependencyKey of listDependencyKeys(target.node)) {
			const dependencyTarget = targetsByIdentity.get(dependencyKey) || null;
			if (dependencyTarget === null) {
				blockedKeys.add(target.identityKey);
				issues.push(
					createPlanIssue(
						"missing-dependency",
						target.identityKey,
						dependencyKey,
					),
				);
				continue;
			}

			addExecutionDependency(adjacency, prereqCounts, dependencyTarget, target);
		}
	}

	return {
		adjacency,
		blockedKeys: propagateBlockedTargets(blockedKeys, adjacency),
		issues: issues.sort(comparePlanIssues),
		prereqCounts,
	};
}

function compareExecutionTargets(left, right) {
	return compareNodeDeclarationOrder(left?.node, right?.node);
}

function createPlanSuccessorMap(adjacency, blockedTargets) {
	const blockedKeys = new Set(
		Array.isArray(blockedTargets)
			? blockedTargets.map((target) => target?.identityKey || "")
			: [],
	);
	const successorsByIdentity = new Map();

	for (const [fromIdentityKey, successorKeys] of adjacency.entries()) {
		const filteredSuccessors = [...successorKeys]
			.filter((successorKey) => !blockedKeys.has(successorKey))
			.sort((left, right) => left.localeCompare(right));
		successorsByIdentity.set(fromIdentityKey, filteredSuccessors);
	}

	return successorsByIdentity;
}

function planExecutionStages(branches) {
	const { targets, targetsByIdentity, targetsByBranchIndex } =
		createExecutionTargetMap(branches);
	const { adjacency, blockedKeys, issues, prereqCounts } = buildExecutionDependencies(
		branches,
		targetsByIdentity,
		targetsByBranchIndex,
	);
	const runnableTargets = targets.filter((target) => !blockedKeys.has(target.identityKey));
	const readyTargets = runnableTargets
		.filter((target) => (prereqCounts.get(target.identityKey) || 0) === 0)
		.sort(compareExecutionTargets);
	const plannedStages = [];
	let completedTargetCount = 0;

	while (readyTargets.length > 0) {
		const stageTargets = readyTargets.splice(0, readyTargets.length);
		plannedStages.push(stageTargets);
		completedTargetCount += stageTargets.length;

		for (const target of stageTargets) {
			const successors = adjacency.get(target.identityKey);
			if (!successors) {
				continue;
			}

			for (const successorIdentityKey of successors) {
				const nextCount = (prereqCounts.get(successorIdentityKey) || 0) - 1;
				prereqCounts.set(successorIdentityKey, nextCount);
				if (nextCount === 0) {
					const successorTarget = targetsByIdentity.get(successorIdentityKey);
					if (successorTarget) {
						readyTargets.push(successorTarget);
					}
				}
			}
		}

		readyTargets.sort(compareExecutionTargets);
	}

	const cycleTargets = runnableTargets
		.filter(
			(target) =>
				(prereqCounts.get(target.identityKey) || 0) > 0 &&
				!blockedKeys.has(target.identityKey),
		)
		.sort(compareExecutionTargets);
	for (const cycleTarget of cycleTargets) {
		blockedKeys.add(cycleTarget.identityKey);
		issues.push(createPlanIssue("dependency-cycle", cycleTarget.identityKey));
	}

	return {
		adjacency,
		blockedTargets: targets
			.filter((target) => blockedKeys.has(target.identityKey))
			.sort(compareExecutionTargets),
		complete: completedTargetCount === targets.length,
		issues: issues.sort(comparePlanIssues),
		stages: plannedStages,
		successorsByIdentity: createPlanSuccessorMap(
			adjacency,
			targets.filter((target) => blockedKeys.has(target.identityKey)),
		),
		targetsByIdentity,
		targetCount: targets.length,
	};
}

function classifyDependencyOutcome(target, execution) {
	if (!target || !execution) {
		return "blocked";
	}

	const passed = execution.ok === true;
	if (target.node?.expectFailure === true) {
		return passed ? "unsatisfied" : "satisfied";
	}

	return passed ? "satisfied" : "unsatisfied";
}

function evaluatePlannedExecution(plan, executionsByIdentity = new Map()) {
	const blockedTargets = Array.isArray(plan?.blockedTargets)
		? plan.blockedTargets.slice().sort(compareExecutionTargets)
		: [];
	const blockedKeys = new Set(blockedTargets.map((target) => target.identityKey));
	const issues = Array.isArray(plan?.issues) ? plan.issues.slice() : [];
	const outcomesByIdentity = new Map();

	for (const blockedTarget of blockedTargets) {
		outcomesByIdentity.set(blockedTarget.identityKey, "blocked");
	}

	const stages = Array.isArray(plan?.stages) ? plan.stages : [];
	const successorsByIdentity =
		plan?.successorsByIdentity instanceof Map ? plan.successorsByIdentity : new Map();

	for (const stage of stages) {
		for (const target of stage) {
			if (blockedKeys.has(target.identityKey)) {
				continue;
			}

			const execution = executionsByIdentity.get(target.identityKey) || null;
			const outcome = classifyDependencyOutcome(target, execution);
			outcomesByIdentity.set(target.identityKey, outcome);
			if (outcome === "satisfied") {
				continue;
			}

			const queue = [...(successorsByIdentity.get(target.identityKey) || [])];
			while (queue.length > 0) {
				const successorIdentityKey = queue.shift();
				if (!successorIdentityKey || blockedKeys.has(successorIdentityKey)) {
					continue;
				}

				const successorTarget =
					plan?.targetsByIdentity instanceof Map
						? plan.targetsByIdentity.get(successorIdentityKey) || null
						: null;
				if (successorTarget !== null) {
					blockedTargets.push(successorTarget);
				}
				blockedKeys.add(successorIdentityKey);
				outcomesByIdentity.set(successorIdentityKey, "blocked");
				issues.push(
					createPlanIssue(
						"blocked-dependency",
						successorIdentityKey,
						target.identityKey,
					),
				);
				queue.push(...(successorsByIdentity.get(successorIdentityKey) || []));
			}
		}
	}

	blockedTargets.sort(compareExecutionTargets);
	issues.sort(comparePlanIssues);

	return {
		blockedTargets,
		issues,
		outcomesByIdentity,
	};
}

async function executePlannedStages(options, branches, stages) {
	const orderedTargets = [];
	for (const stage of stages) {
		for (const target of stage) {
			orderedTargets.push(target);
		}
	}

	if (orderedTargets.length === 0) {
		return 0;
	}

	const executionGroups = await runTasksInWorkerPool(
		options.workerModulePath,
		options.bytes,
		"runBranch",
		orderedTargets.map((target) => ({
			runTargets: [target.node],
		})),
		1,
	);

	for (let index = 0; index < orderedTargets.length; index += 1) {
		const target = orderedTargets[index];
		const executionGroup = executionGroups[index] || null;
		const branch = branches[target.branchIndex];
		branch.executions[target.executionIndex] = executionGroup?.executions?.[0] || null;
		if (executionGroup?.coverage) {
			branch.coverageSnapshots = branch.coverageSnapshots || [];
			branch.coverageSnapshots.push(executionGroup.coverage);
		}
	}

	return 1;
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
		branches = topLevelNodes.map((root, index) => ({
			index,
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
		const plannedExecution = planExecutionStages(branches);
		discoveryOk = plannedExecution.complete;
		if (discoveryOk) {
			workerCount = await executePlannedStages(
				options,
				branches,
				plannedExecution.stages,
			);
		}
	}

	let ok = discoveryOk;
	let discoveredTestCount = 0;
	const coverageSnapshots = initialCoverage ? [initialCoverage] : [];
	for (const branch of branches) {
		discoveredTestCount += branch.discovery.testCount;
		branch.executions = branch.executions.filter(Boolean);
		branch.ok =
			branch.discovery.ok && branch.executions.every((execution) => execution.ok);
		if (!branch.ok) {
			ok = false;
		}
		if (Array.isArray(branch.coverageSnapshots)) {
			coverageSnapshots.push(...branch.coverageSnapshots);
		}
		delete branch.coverageSnapshots;
		delete branch.index;
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
	classifyDependencyOutcome,
	cloneEvent,
	closeHarness,
	discoverBranch,
	decorateHarness,
	EVENT_TYPES,
	evaluatePlannedExecution,
	planExecutionStages,
	readCoverageSnapshot,
	setNodeIdentity,
};
