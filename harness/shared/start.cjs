"use strict";

const os = require("node:os");
const path = require("node:path");
const { Worker } = require("node:worker_threads");
const {
	cloneCoverageSnapshot,
	mergeCoverageSnapshots,
} = require("./covers.cjs");

const NODE_KIND_TEST = 1;
const DECLARATION_MODE_NORMAL = 1;
const NODE_IDENTITY_KEY = Symbol("nodeIdentityKey");
const NODE_PARENT_IDENTITY_KEY = Symbol("nodeParentIdentityKey");
const SEQUENCE_MODE_SEQUENTIAL = 1;
const RUNNER_MODE_IN_BAND = 1;
const FAILURE_POLICY_CONTINUE = 1;
const FAILURE_POLICY_BAIL = 2;
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

function isExecutionSatisfied(node, rawOk) {
	const passed = rawOk === true;
	if (node?.expectFailure === true) {
		return !passed;
	}

	return passed;
}

function createExecutionRecord(node, rawOk, events) {
	return {
		node,
		ok: isExecutionSatisfied(node, rawOk),
		events,
	};
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
		nodeIndex: Array.isArray(node?.nodeIndex) ? node.nodeIndex.slice() : [],
		nodeId: typeof node?.nodeId === "number" ? node.nodeId >>> 0 : 0,
		parentNodeId:
			typeof node?.parentNodeId === "number" ? node.parentNodeId >>> 0 : 0,
		declarationOrder:
			typeof node?.declarationOrder === "number"
				? node.declarationOrder >>> 0
				: 0,
		sequenceMode:
			typeof node?.sequenceMode === "number" ? node.sequenceMode >>> 0 : 0,
		preferredRunnerMode:
			typeof node?.preferredRunnerMode === "number"
				? node.preferredRunnerMode >>> 0
				: 0,
		preferredFailurePolicy:
			typeof node?.preferredFailurePolicy === "number"
				? node.preferredFailurePolicy >>> 0
				: 0,
		dependencyNodeIds: Array.isArray(node?.dependencyNodeIds)
			? node.dependencyNodeIds
					.filter((dependencyNodeId) => typeof dependencyNodeId === "number")
					.map((dependencyNodeId) => dependencyNodeId >>> 0)
			: [],
		only: node?.only === true,
		expectFailure: node?.expectFailure === true,
		kind: typeof node?.kind === "number" ? node.kind >>> 0 : 0,
		declarationMode:
			typeof node?.declarationMode === "number"
				? node.declarationMode >>> 0
				: 0,
		name: typeof node?.name === "string" ? node.name : "",
	};
}

function clonePlanIssue(issue) {
	const clone = {
		type: typeof issue?.type === "string" ? issue.type : "",
		issueLabel: typeof issue?.issueLabel === "string" ? issue.issueLabel : "",
		targetIdentityKey:
			typeof issue?.targetIdentityKey === "string"
				? issue.targetIdentityKey
				: "",
		dependencyIdentityKey:
			typeof issue?.dependencyIdentityKey === "string"
				? issue.dependencyIdentityKey
				: "",
	};

	if (typeof issue?.hintName === "string" && issue.hintName.length > 0) {
		clone.hintName = issue.hintName;
	}
	if (typeof issue?.hintValue === "number") {
		clone.hintValue = issue.hintValue >>> 0;
	}

	return clone;
}

function cloneBlockedNode(blocked) {
	return {
		node: cloneNode(blocked?.node),
		issueType: typeof blocked?.issueType === "string" ? blocked.issueType : "",
		issueLabel:
			typeof blocked?.issueLabel === "string" ? blocked.issueLabel : "",
		dependencyIdentityKey:
			typeof blocked?.dependencyIdentityKey === "string"
				? blocked.dependencyIdentityKey
				: "",
	};
}

function cloneRunMetadata(metadata) {
	return {
		ok: metadata?.ok === true,
		discoveryOk: metadata?.discoveryOk === true,
		planningOk: metadata?.planningOk === true,
		discoveredTestCount:
			typeof metadata?.discoveredTestCount === "number"
				? metadata.discoveredTestCount >>> 0
				: 0,
		topLevelNodes: Array.isArray(metadata?.topLevelNodes)
			? metadata.topLevelNodes.map(cloneNode)
			: [],
		workerCount:
			typeof metadata?.workerCount === "number"
				? metadata.workerCount >>> 0
				: 0,
		planIssues: Array.isArray(metadata?.planIssues)
			? metadata.planIssues.map(clonePlanIssue)
			: [],
		blocked: Array.isArray(metadata?.blocked)
			? metadata.blocked.map(cloneBlockedNode)
			: [],
		coverage:
			metadata?.coverage === null || metadata?.coverage === undefined
				? null
				: cloneCoverageSnapshot(metadata.coverage),
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
	if (
		!Array.isArray(left) ||
		!Array.isArray(right) ||
		left.length !== right.length
	) {
		return false;
	}

	for (let index = 0; index < left.length; index += 1) {
		if (left[index] >>> 0 !== right[index] >>> 0) {
			return false;
		}
	}

	return true;
}

function compareNodeDeclarationOrder(left, right) {
	const leftOrder =
		typeof left?.declarationOrder === "number"
			? left.declarationOrder >>> 0
			: 0;
	const rightOrder =
		typeof right?.declarationOrder === "number"
			? right.declarationOrder >>> 0
			: 0;
	if (leftOrder !== rightOrder) {
		return leftOrder - rightOrder;
	}

	return getNodeIdentityKey(left).localeCompare(
		getNodeIdentityKey(right),
		undefined,
		{
			numeric: true,
			sensitivity: "base",
		},
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
	createHarnessOptions,
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
					createHarnessOptions,
				},
			});
			workers.push(worker);

			worker.on("message", (message) => {
				if (settled || message === null || typeof message !== "object") {
					return;
				}

				if (message.type === "taskError" && message.taskType === taskType) {
					settleError(new Error(message.error || `${taskType} worker failed`));
					return;
				}

				if (message.type !== "taskResult" || message.taskType !== taskType) {
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

function runBranchTaskInBand(options, task) {
	const harness = options.createLocalHarness(
		options.bytes,
		options.createHarnessOptions,
	);
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
		for (const node of task.runTargets) {
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

function createExecutionTarget(
	branchIndex,
	executionIndex,
	node,
	nodesByIdentity,
) {
	const runnerModeHint = resolveNearestHint(
		node,
		nodesByIdentity,
		"preferredRunnerMode",
		0,
	);
	const failurePolicyHint = resolveNearestHint(
		node,
		nodesByIdentity,
		"preferredFailurePolicy",
		0,
	);

	return {
		branchIndex,
		executionIndex,
		identityKey: getNodeIdentityKey(node),
		node,
		preferredRunnerMode: runnerModeHint.value,
		preferredRunnerModeScopeIdentityKey: runnerModeHint.scopeIdentityKey,
		preferredFailurePolicy: failurePolicyHint.value,
		preferredFailurePolicyScopeIdentityKey: failurePolicyHint.scopeIdentityKey,
	};
}

function createBranchNodeIdentityMap(branch) {
	const nodesByIdentity = new Map();

	for (const node of Array.isArray(branch?.discovery?.nodes)
		? branch.discovery.nodes
		: []) {
		nodesByIdentity.set(getNodeIdentityKey(node), node);
	}

	return nodesByIdentity;
}

function resolveNearestHint(
	node,
	nodesByIdentity,
	fieldName,
	inheritValue = 0,
) {
	let cursor = node || null;

	while (cursor !== null) {
		const value =
			typeof cursor?.[fieldName] === "number"
				? cursor[fieldName] >>> 0
				: inheritValue;
		if (value !== inheritValue) {
			return {
				value,
				scopeIdentityKey: getNodeIdentityKey(cursor),
			};
		}

		const parentIdentityKey = getNodeParentIdentityKey(cursor);
		cursor =
			parentIdentityKey.length > 0
				? nodesByIdentity.get(parentIdentityKey) || null
				: null;
	}

	return {
		value: inheritValue,
		scopeIdentityKey: "",
	};
}

function createScopedNodeIdMap() {
	return new Map();
}

function getScopeTargetsByNodeId(targetsByScopeAndNodeId, parentIdentityKey) {
	const scopeIdentityKey =
		typeof parentIdentityKey === "string" && parentIdentityKey.length > 0
			? parentIdentityKey
			: "";
	let scopeTargetsByNodeId =
		targetsByScopeAndNodeId.get(scopeIdentityKey) || null;
	if (scopeTargetsByNodeId !== null) {
		return scopeTargetsByNodeId;
	}

	scopeTargetsByNodeId = new Map();
	targetsByScopeAndNodeId.set(scopeIdentityKey, scopeTargetsByNodeId);
	return scopeTargetsByNodeId;
}

function createParentIdentityChain(parentIdentityKey) {
	const chain = [];
	let currentIdentityKey =
		typeof parentIdentityKey === "string" && parentIdentityKey.length > 0
			? parentIdentityKey
			: "";

	while (true) {
		chain.push(currentIdentityKey);
		if (!currentIdentityKey) {
			break;
		}

		currentIdentityKey = currentIdentityKey.includes("/")
			? currentIdentityKey.slice(0, currentIdentityKey.lastIndexOf("/"))
			: "";
	}

	return chain;
}

function resolveDependencyNodeId(
	target,
	dependencyNodeId,
	targetsByScopeAndNodeId,
) {
	if (typeof dependencyNodeId !== "number" || dependencyNodeId <= 0) {
		return null;
	}

	const normalizedDependencyNodeId = dependencyNodeId >>> 0;
	for (const parentIdentityKey of createParentIdentityChain(
		getNodeParentIdentityKey(target?.node),
	)) {
		const scopeTargetsByNodeId =
			targetsByScopeAndNodeId.get(parentIdentityKey) || null;
		const dependencyTarget =
			scopeTargetsByNodeId?.get(normalizedDependencyNodeId) || null;
		if (dependencyTarget !== null) {
			return dependencyTarget;
		}
	}

	return null;
}

function listDependencyKeys(target, targetsByScopeAndNodeId = new Map()) {
	const dependencyKeys = [];
	const seen = new Set();
	const node = target?.node || null;
	if (Array.isArray(node?.dependencyKeys)) {
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
	}

	if (Array.isArray(node?.dependencyNodeIds)) {
		for (const dependencyNodeId of node.dependencyNodeIds) {
			if (typeof dependencyNodeId !== "number" || dependencyNodeId <= 0) {
				continue;
			}

			const normalizedDependencyNodeId = dependencyNodeId >>> 0;
			const dependencyTarget = resolveDependencyNodeId(
				target,
				normalizedDependencyNodeId,
				targetsByScopeAndNodeId,
			);
			const dependencyKey =
				dependencyTarget?.identityKey || `nodeId:${normalizedDependencyNodeId}`;
			if (seen.has(dependencyKey)) {
				continue;
			}

			seen.add(dependencyKey);
			dependencyKeys.push(dependencyKey);
		}
	}

	return dependencyKeys;
}

function createExecutionTargetMap(branches) {
	const targets = [];
	const targetsByIdentity = new Map();
	const targetsByScopeAndNodeId = createScopedNodeIdMap();
	const targetsByBranchIndex = new Map();

	for (const branch of branches) {
		const runnableTests = listRunnableTests(branch.discovery.nodes);
		const nodesByIdentity = createBranchNodeIdentityMap(branch);
		branch.executions = new Array(runnableTests.length);
		const branchTargets = [];

		for (let index = 0; index < runnableTests.length; index += 1) {
			const node = runnableTests[index];
			const target = createExecutionTarget(
				branch.index,
				index,
				node,
				nodesByIdentity,
			);
			targets.push(target);
			targetsByIdentity.set(target.identityKey, target);
			if (typeof node?.nodeId === "number" && node.nodeId > 0) {
				const scopeTargetsByNodeId = getScopeTargetsByNodeId(
					targetsByScopeAndNodeId,
					getNodeParentIdentityKey(node),
				);
				if (!scopeTargetsByNodeId.has(node.nodeId >>> 0)) {
					scopeTargetsByNodeId.set(node.nodeId >>> 0, target);
				}
			}
			branchTargets.push(target);
		}

		targetsByBranchIndex.set(branch.index, branchTargets);
	}

	return {
		targets,
		targetsByIdentity,
		targetsByScopeAndNodeId,
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
		if (node.sequenceMode >>> 0 !== SEQUENCE_MODE_SEQUENTIAL) {
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

function isSupportedSequenceMode(value) {
	return value === 0 || value === SEQUENCE_MODE_SEQUENTIAL;
}

function collectInvalidSequenceConstraintIssues(
	branches,
	targetsByBranchIndex,
) {
	const issues = [];
	const blockedKeys = new Set();

	for (const branch of Array.isArray(branches) ? branches : []) {
		const branchTargets = targetsByBranchIndex.get(branch.index) || [];
		for (const node of Array.isArray(branch?.discovery?.nodes)
			? branch.discovery.nodes
			: []) {
			const sequenceMode =
				typeof node?.sequenceMode === "number" ? node.sequenceMode >>> 0 : 0;
			if (isSupportedSequenceMode(sequenceMode)) {
				continue;
			}

			const scopeIdentityKey = getNodeIdentityKey(node);
			for (const target of branchTargets) {
				if (!isIdentityWithinScope(target.identityKey, scopeIdentityKey)) {
					continue;
				}
				if (blockedKeys.has(target.identityKey)) {
					continue;
				}

				blockedKeys.add(target.identityKey);
				issues.push(createPlanIssue("invalid-constraint", target.identityKey));
			}
		}
	}

	return {
		blockedKeys,
		issues: issues.sort(comparePlanIssues),
	};
}

function addExecutionDependency(adjacency, prereqCounts, fromTarget, toTarget) {
	if (
		!fromTarget ||
		!toTarget ||
		fromTarget.identityKey === toTarget.identityKey
	) {
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

	const leftHintName = left?.hintName || "";
	const rightHintName = right?.hintName || "";
	if (leftHintName !== rightHintName) {
		return leftHintName.localeCompare(rightHintName);
	}

	const leftHintValue =
		typeof left?.hintValue === "number" ? left.hintValue >>> 0 : 0;
	const rightHintValue =
		typeof right?.hintValue === "number" ? right.hintValue >>> 0 : 0;
	if (leftHintValue !== rightHintValue) {
		return leftHintValue - rightHintValue;
	}

	return (left?.type || "").localeCompare(right?.type || "");
}

function createPlanIssue(
	type,
	targetIdentityKey,
	dependencyIdentityKey = "",
	detail = null,
) {
	const issue = {
		type,
		issueLabel: formatIssueLabel(type),
		targetIdentityKey,
		dependencyIdentityKey,
	};

	if (typeof detail?.hintName === "string" && detail.hintName.length > 0) {
		issue.hintName = detail.hintName;
	}
	if (typeof detail?.hintValue === "number") {
		issue.hintValue = detail.hintValue >>> 0;
	}

	return issue;
}

function formatIssueLabel(type) {
	switch (type) {
		case "invalid-constraint":
			return "invalid constraint";
		case "bailed":
			return "stopped after failure";
		case "blocked-dependency":
			return "blocked by prerequisite";
		case "missing-dependency":
			return "missing prerequisite";
		case "dependency-cycle":
			return "dependency cycle";
		case "ignored-hint":
			return "ignored hint";
		default:
			return type;
	}
}

function isPlanningIssueType(type) {
	return type !== "bailed" && type !== "ignored-hint";
}

function hasMalformedDependencyMetadata(node) {
	if (Array.isArray(node?.dependencyKeys)) {
		for (const dependencyKey of node.dependencyKeys) {
			if (typeof dependencyKey !== "string" || dependencyKey.length === 0) {
				return true;
			}
		}
	}

	if (Array.isArray(node?.dependencyNodeIds)) {
		for (const dependencyNodeId of node.dependencyNodeIds) {
			if (typeof dependencyNodeId !== "number" || dependencyNodeId <= 0) {
				return true;
			}
		}
	}

	return false;
}

function isSupportedRunnerModeHint(value) {
	return value === 0 || value === RUNNER_MODE_IN_BAND;
}

function isSupportedFailurePolicyHint(value) {
	return (
		value === 0 ||
		value === FAILURE_POLICY_CONTINUE ||
		value === FAILURE_POLICY_BAIL
	);
}

function collectIgnoredHintIssues(branches) {
	const issues = [];
	const seen = new Set();

	for (const branch of Array.isArray(branches) ? branches : []) {
		for (const node of Array.isArray(branch?.discovery?.nodes)
			? branch.discovery.nodes
			: []) {
			const targetIdentityKey = getNodeIdentityKey(node);
			const preferredRunnerMode =
				typeof node?.preferredRunnerMode === "number"
					? node.preferredRunnerMode >>> 0
					: 0;
			if (!isSupportedRunnerModeHint(preferredRunnerMode)) {
				const issueKey = `${targetIdentityKey}:preferredRunnerMode:${preferredRunnerMode}`;
				if (!seen.has(issueKey)) {
					seen.add(issueKey);
					issues.push(
						createPlanIssue("ignored-hint", targetIdentityKey, "", {
							hintName: "preferredRunnerMode",
							hintValue: preferredRunnerMode,
						}),
					);
				}
			}

			const preferredFailurePolicy =
				typeof node?.preferredFailurePolicy === "number"
					? node.preferredFailurePolicy >>> 0
					: 0;
			if (!isSupportedFailurePolicyHint(preferredFailurePolicy)) {
				const issueKey = `${targetIdentityKey}:preferredFailurePolicy:${preferredFailurePolicy}`;
				if (!seen.has(issueKey)) {
					seen.add(issueKey);
					issues.push(
						createPlanIssue("ignored-hint", targetIdentityKey, "", {
							hintName: "preferredFailurePolicy",
							hintValue: preferredFailurePolicy,
						}),
					);
				}
			}
		}
	}

	return issues.sort(comparePlanIssues);
}

function appendBlockedTarget(
	blockedTargets,
	blockedKeys,
	outcomesByIdentity,
	issues,
	target,
	type,
	dependencyIdentityKey = "",
) {
	if (!target || blockedKeys.has(target.identityKey)) {
		return;
	}

	blockedTargets.push(target);
	blockedKeys.add(target.identityKey);
	outcomesByIdentity.set(target.identityKey, "blocked");
	issues.push(createPlanIssue(type, target.identityKey, dependencyIdentityKey));
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

function buildExecutionDependencies(
	branches,
	targetsByIdentity,
	targetsByScopeAndNodeId,
	targetsByBranchIndex,
) {
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

		for (const scopeTargets of collectSequentialScopeTargets(
			branch,
			branchTargets,
		)) {
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
		if (hasMalformedDependencyMetadata(target.node)) {
			blockedKeys.add(target.identityKey);
			issues.push(createPlanIssue("invalid-constraint", target.identityKey));
			continue;
		}

		for (const dependencyKey of listDependencyKeys(
			target,
			targetsByScopeAndNodeId,
		)) {
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

function getParallelWorkerCount(taskCount) {
	if (taskCount <= 0) {
		return 0;
	}

	const availableParallelism =
		typeof os.availableParallelism === "function"
			? os.availableParallelism()
			: 1;
	return Math.max(1, Math.min(taskCount, availableParallelism));
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

function createStageExecutionBatch(
	stageTargets,
	blockedKeys,
	outcomesByIdentity,
) {
	const batch = [];
	const activeBailScopes = new Set();

	for (const target of stageTargets) {
		if (
			!target ||
			blockedKeys.has(target.identityKey) ||
			outcomesByIdentity.has(target.identityKey)
		) {
			continue;
		}

		if (
			target.preferredFailurePolicy === FAILURE_POLICY_BAIL &&
			typeof target.preferredFailurePolicyScopeIdentityKey === "string" &&
			target.preferredFailurePolicyScopeIdentityKey.length > 0
		) {
			if (activeBailScopes.has(target.preferredFailurePolicyScopeIdentityKey)) {
				continue;
			}

			activeBailScopes.add(target.preferredFailurePolicyScopeIdentityKey);
		}

		batch.push(target);
	}

	return batch;
}

function runSingleTargetInBand(options, target) {
	return runBranchTaskInBand(options, {
		runTargets: [target.node],
	});
}

async function runExecutionBatch(options, stageTargets) {
	if (stageTargets.length === 0) {
		return {
			results: [],
			workerCount: 0,
		};
	}

	if (options.runInBand === true) {
		return {
			results: stageTargets.map((target) =>
				runSingleTargetInBand(options, target),
			),
			workerCount: 1,
		};
	}

	const workerTargets = [];
	const workerIndexes = [];
	const inBandTargets = [];
	const inBandIndexes = [];

	for (let index = 0; index < stageTargets.length; index += 1) {
		const target = stageTargets[index];
		if (target.preferredRunnerMode === RUNNER_MODE_IN_BAND) {
			inBandTargets.push(target);
			inBandIndexes.push(index);
			continue;
		}

		workerTargets.push(target);
		workerIndexes.push(index);
	}

	const workerPoolCount = getParallelWorkerCount(workerTargets.length);
	if (workerTargets.length === 0) {
		return {
			results: stageTargets.map((target) =>
				runSingleTargetInBand(options, target),
			),
			workerCount: 1,
		};
	}

	if (inBandTargets.length === 0 && workerPoolCount <= 1) {
		return {
			results: stageTargets.map((target) =>
				runSingleTargetInBand(options, target),
			),
			workerCount: 1,
		};
	}

	const results = new Array(stageTargets.length);
	const workerPromise =
		workerTargets.length > 0
			? runTasksInWorkerPool(
					options.workerModulePath,
					options.bytes,
					options.createHarnessOptions,
					"runBranch",
					workerTargets.map((target) => ({
						runTargets: [target.node],
					})),
					workerPoolCount,
				)
			: Promise.resolve([]);

	for (let index = 0; index < inBandTargets.length; index += 1) {
		results[inBandIndexes[index]] = runSingleTargetInBand(
			options,
			inBandTargets[index],
		);
	}

	const workerResults = await workerPromise;
	for (let index = 0; index < workerResults.length; index += 1) {
		results[workerIndexes[index]] = workerResults[index];
	}

	return {
		results,
		workerCount: workerPoolCount + (inBandTargets.length > 0 ? 1 : 0),
	};
}

function blockDependentTargets(
	sourceTarget,
	successorsByIdentity,
	targetsByIdentity,
	blockedTargets,
	blockedKeys,
	outcomesByIdentity,
	issues,
) {
	const queue = [...(successorsByIdentity.get(sourceTarget.identityKey) || [])];
	while (queue.length > 0) {
		const successorIdentityKey = queue.shift();
		if (!successorIdentityKey || blockedKeys.has(successorIdentityKey)) {
			continue;
		}

		const successorTarget = targetsByIdentity.get(successorIdentityKey) || null;
		if (successorTarget !== null) {
			appendBlockedTarget(
				blockedTargets,
				blockedKeys,
				outcomesByIdentity,
				issues,
				successorTarget,
				"blocked-dependency",
				sourceTarget.identityKey,
			);
		}
		queue.push(...(successorsByIdentity.get(successorIdentityKey) || []));
	}
}

function blockBailedTargets(
	sourceTarget,
	targetsByIdentity,
	blockedTargets,
	blockedKeys,
	outcomesByIdentity,
	issues,
) {
	if (
		sourceTarget.preferredFailurePolicy !== FAILURE_POLICY_BAIL ||
		typeof sourceTarget.preferredFailurePolicyScopeIdentityKey !== "string" ||
		sourceTarget.preferredFailurePolicyScopeIdentityKey.length === 0
	) {
		return;
	}

	for (const candidateTarget of targetsByIdentity.values()) {
		if (
			candidateTarget.identityKey === sourceTarget.identityKey ||
			blockedKeys.has(candidateTarget.identityKey) ||
			outcomesByIdentity.has(candidateTarget.identityKey) ||
			candidateTarget.preferredFailurePolicy !== FAILURE_POLICY_BAIL ||
			candidateTarget.preferredFailurePolicyScopeIdentityKey !==
				sourceTarget.preferredFailurePolicyScopeIdentityKey
		) {
			continue;
		}

		appendBlockedTarget(
			blockedTargets,
			blockedKeys,
			outcomesByIdentity,
			issues,
			candidateTarget,
			"bailed",
			sourceTarget.identityKey,
		);
	}
}

function planExecutionStages(branches) {
	const {
		targets,
		targetsByIdentity,
		targetsByScopeAndNodeId,
		targetsByBranchIndex,
	} = createExecutionTargetMap(branches);
	const { adjacency, blockedKeys, issues, prereqCounts } =
		buildExecutionDependencies(
			branches,
			targetsByIdentity,
			targetsByScopeAndNodeId,
			targetsByBranchIndex,
		);
	const invalidSequenceConstraints = collectInvalidSequenceConstraintIssues(
		branches,
		targetsByBranchIndex,
	);
	for (const blockedKey of invalidSequenceConstraints.blockedKeys) {
		blockedKeys.add(blockedKey);
	}
	const runnableTargets = targets.filter(
		(target) => !blockedKeys.has(target.identityKey),
	);
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
		issues: issues
			.concat(invalidSequenceConstraints.issues)
			.concat(collectIgnoredHintIssues(branches))
			.sort(comparePlanIssues),
		stages: plannedStages,
		successorsByIdentity: createPlanSuccessorMap(
			adjacency,
			targets.filter((target) => blockedKeys.has(target.identityKey)),
		),
		targets,
		targetsByIdentity,
		targetCount: targets.length,
	};
}

function classifyDependencyOutcome(target, execution) {
	if (!target || !execution) {
		return "blocked";
	}

	return execution.ok === true ? "satisfied" : "unsatisfied";
}

function evaluatePlannedExecution(plan, executionsByIdentity = new Map()) {
	const blockedTargets = Array.isArray(plan?.blockedTargets)
		? plan.blockedTargets.slice().sort(compareExecutionTargets)
		: [];
	const blockedKeys = new Set(
		blockedTargets.map((target) => target.identityKey),
	);
	const issues = Array.isArray(plan?.issues) ? plan.issues.slice() : [];
	const outcomesByIdentity = new Map();

	for (const blockedTarget of blockedTargets) {
		outcomesByIdentity.set(blockedTarget.identityKey, "blocked");
	}

	const stages = Array.isArray(plan?.stages) ? plan.stages : [];
	const successorsByIdentity =
		plan?.successorsByIdentity instanceof Map
			? plan.successorsByIdentity
			: new Map();
	const targetsByIdentity =
		plan?.targetsByIdentity instanceof Map ? plan.targetsByIdentity : new Map();

	for (const stage of stages) {
		while (true) {
			const batchTargets = createStageExecutionBatch(
				stage,
				blockedKeys,
				outcomesByIdentity,
			);
			if (batchTargets.length === 0) {
				break;
			}

			for (const target of batchTargets) {
				const execution = executionsByIdentity.get(target.identityKey) || null;
				const outcome = classifyDependencyOutcome(target, execution);
				outcomesByIdentity.set(target.identityKey, outcome);
				if (outcome === "satisfied") {
					continue;
				}

				blockDependentTargets(
					target,
					successorsByIdentity,
					targetsByIdentity,
					blockedTargets,
					blockedKeys,
					outcomesByIdentity,
					issues,
				);
				blockBailedTargets(
					target,
					targetsByIdentity,
					blockedTargets,
					blockedKeys,
					outcomesByIdentity,
					issues,
				);
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

function createBlockedNodeIssueMap(evaluatedExecution) {
	const blockedIssueMap = new Map();

	for (const issue of Array.isArray(evaluatedExecution?.issues)
		? evaluatedExecution.issues
		: []) {
		if (
			!issue ||
			typeof issue.targetIdentityKey !== "string" ||
			issue.targetIdentityKey.length === 0
		) {
			continue;
		}
		if (blockedIssueMap.has(issue.targetIdentityKey)) {
			continue;
		}

		blockedIssueMap.set(issue.targetIdentityKey, issue);
	}

	return blockedIssueMap;
}

function toBlockedNode(target, issue) {
	const issueType =
		typeof issue?.type === "string" ? issue.type : "blocked-dependency";
	return {
		node: cloneNode(target.node),
		issueType,
		issueLabel:
			typeof issue?.issueLabel === "string"
				? issue.issueLabel
				: formatIssueLabel(issueType),
		dependencyIdentityKey:
			typeof issue?.dependencyIdentityKey === "string"
				? issue.dependencyIdentityKey
				: "",
	};
}

function toPlanIssues(issues) {
	return (Array.isArray(issues) ? issues : []).map((issue) => {
		const normalized = {
			type: typeof issue?.type === "string" ? issue.type : "",
			issueLabel:
				typeof issue?.issueLabel === "string"
					? issue.issueLabel
					: formatIssueLabel(typeof issue?.type === "string" ? issue.type : ""),
			targetIdentityKey:
				typeof issue?.targetIdentityKey === "string"
					? issue.targetIdentityKey
					: "",
			dependencyIdentityKey:
				typeof issue?.dependencyIdentityKey === "string"
					? issue.dependencyIdentityKey
					: "",
		};

		if (typeof issue?.hintName === "string" && issue.hintName.length > 0) {
			normalized.hintName = issue.hintName;
		}
		if (typeof issue?.hintValue === "number") {
			normalized.hintValue = issue.hintValue >>> 0;
		}

		return normalized;
	});
}

async function executePlannedStages(options, branches, plan) {
	const blockedTargets = Array.isArray(plan?.blockedTargets)
		? plan.blockedTargets.slice().sort(compareExecutionTargets)
		: [];
	const blockedKeys = new Set(
		blockedTargets.map((target) => target.identityKey),
	);
	const issues = Array.isArray(plan?.issues) ? plan.issues.slice() : [];
	const outcomesByIdentity = new Map();
	const successorsByIdentity =
		plan?.successorsByIdentity instanceof Map
			? plan.successorsByIdentity
			: new Map();
	const targetsByIdentity =
		plan?.targetsByIdentity instanceof Map ? plan.targetsByIdentity : new Map();
	let workerCount = 0;

	for (const blockedTarget of blockedTargets) {
		outcomesByIdentity.set(blockedTarget.identityKey, "blocked");
	}

	for (const stage of Array.isArray(plan?.stages) ? plan.stages : []) {
		while (true) {
			const batchTargets = createStageExecutionBatch(
				stage,
				blockedKeys,
				outcomesByIdentity,
			);
			if (batchTargets.length === 0) {
				break;
			}

			const batchExecution = await runExecutionBatch(options, batchTargets);
			workerCount = Math.max(workerCount, batchExecution.workerCount);

			for (let index = 0; index < batchTargets.length; index += 1) {
				const target = batchTargets[index];
				const executionGroup = batchExecution.results[index] || null;
				const branch = branches[target.branchIndex];
				const execution = executionGroup?.executions?.[0] || null;
				branch.executions[target.executionIndex] = execution;
				if (executionGroup?.coverage) {
					branch.coverageSnapshots = branch.coverageSnapshots || [];
					branch.coverageSnapshots.push(executionGroup.coverage);
				}

				const outcome = classifyDependencyOutcome(target, execution);
				outcomesByIdentity.set(target.identityKey, outcome);
				if (outcome === "satisfied") {
					continue;
				}

				blockDependentTargets(
					target,
					successorsByIdentity,
					targetsByIdentity,
					blockedTargets,
					blockedKeys,
					outcomesByIdentity,
					issues,
				);
				blockBailedTargets(
					target,
					targetsByIdentity,
					blockedTargets,
					blockedKeys,
					outcomesByIdentity,
					issues,
				);
			}
		}
	}

	blockedTargets.sort(compareExecutionTargets);
	issues.sort(comparePlanIssues);

	return {
		blockedTargets,
		issues,
		outcomesByIdentity,
		workerCount,
	};
}

async function startHarness(options) {
	const discoveryHarness = options.createLocalHarness(
		options.bytes,
		options.createHarnessOptions,
	);
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
	let evaluatedExecution = {
		blockedTargets: [],
		issues: [],
		outcomesByIdentity: new Map(),
	};
	if (discoveryOk) {
		const plannedExecution = planExecutionStages(branches);
		evaluatedExecution = await executePlannedStages(
			options,
			branches,
			plannedExecution,
		);
		workerCount = evaluatedExecution.workerCount;
	}

	let ok = discoveryOk;
	const blockedIssueMap = createBlockedNodeIssueMap(evaluatedExecution);
	const blocked = evaluatedExecution.blockedTargets.map((target) =>
		toBlockedNode(target, blockedIssueMap.get(target.identityKey) || null),
	);
	const planningOk = evaluatedExecution.issues.every(
		(issue) => !isPlanningIssueType(issue?.type || ""),
	);
	if (!planningOk || blocked.length > 0) {
		ok = false;
	}
	let discoveredTestCount = 0;
	const coverageSnapshots = initialCoverage ? [initialCoverage] : [];
	for (const branch of branches) {
		discoveredTestCount += branch.discovery.testCount;
		branch.executions = branch.executions.filter(Boolean);
		branch.ok =
			branch.discovery.ok &&
			branch.executions.every((execution) => execution.ok);
		if (!branch.ok) {
			ok = false;
		}
		if (Array.isArray(branch.coverageSnapshots)) {
			coverageSnapshots.push(...branch.coverageSnapshots);
		}
		delete branch.coverageSnapshots;
		delete branch.index;
	}
	const coverage =
		coverageSnapshots.length > 0
			? mergeCoverageSnapshots(coverageSnapshots)
			: null;
	const summary = cloneRunMetadata({
		ok,
		discoveryOk,
		planningOk,
		discoveredTestCount,
		topLevelNodes,
		workerCount,
		planIssues: toPlanIssues(evaluatedExecution.issues),
		blocked,
		coverage,
	});

	return {
		...summary,
		metadata: cloneRunMetadata(summary),
		branches,
	};
}

function decorateHarness(harness, options) {
	harness.start = function start() {
		return startHarness({
			bytes: Buffer.from(options.bytes),
			createLocalHarness: options.createLocalHarness,
			createHarnessOptions: options.createHarnessOptions,
			runInBand: options.runInBand === true,
			workerModulePath: path.resolve(options.workerModulePath),
		});
	};

	return harness;
}

module.exports = {
	classifyDependencyOutcome,
	cloneEvent,
	closeHarness,
	createExecutionRecord,
	discoverBranch,
	decorateHarness,
	EVENT_TYPES,
	evaluatePlannedExecution,
	planExecutionStages,
	readCoverageSnapshot,
	setNodeIdentity,
};
