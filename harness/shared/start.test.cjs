"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
	classifyDependencyOutcome,
	decorateHarness,
	evaluatePlannedExecution,
	planExecutionStages,
	setNodeIdentity,
} = require("./start.cjs");

function createPlannerNode(options) {
	return setNodeIdentity(
		{
			nodeIndex: options.nodeIndex ?? [],
			nodeId: options.nodeId ?? 0,
			parentNodeId: options.parentNodeId ?? 0,
			declarationOrder: options.declarationOrder ?? 0,
			sequenceMode: options.sequenceMode ?? 0,
			dependencyNodeIds: options.dependencyNodeIds ?? [],
			dependencyKeys: options.dependencyKeys ?? [],
			expectFailure: options.expectFailure ?? false,
			kind: options.kind ?? 1,
			declarationMode: options.declarationMode ?? 1,
			name: options.name ?? "",
		},
		options.identityKey,
		options.parentIdentityKey ?? "",
	);
}

function createPlannerBranch(index, nodes) {
	return {
		index,
		discovery: {
			ok: true,
			nodes,
			testCount: nodes.filter((node) => node.kind === 1).length,
		},
		executions: [],
		ok: true,
		root: nodes[0],
	};
}

test("planExecutionStages only serializes descendants of sequential scopes", () => {
	const root = createPlannerNode({
		identityKey: "id:1",
		nodeId: 1,
		declarationOrder: 0,
		kind: 2,
		name: "root suite",
	});
	const plainBefore = createPlannerNode({
		identityKey: "id:1/id:2",
		parentIdentityKey: "id:1",
		nodeId: 2,
		parentNodeId: 1,
		declarationOrder: 1,
		name: "plain before",
	});
	const sequentialSuite = createPlannerNode({
		identityKey: "id:1/id:3",
		parentIdentityKey: "id:1",
		nodeId: 3,
		parentNodeId: 1,
		declarationOrder: 2,
		sequenceMode: 1,
		kind: 2,
		name: "sequential suite",
	});
	const sequentialFirst = createPlannerNode({
		identityKey: "id:1/id:3/id:4",
		parentIdentityKey: "id:1/id:3",
		nodeId: 4,
		parentNodeId: 3,
		declarationOrder: 3,
		name: "sequential first",
	});
	const sequentialSecond = createPlannerNode({
		identityKey: "id:1/id:3/id:5",
		parentIdentityKey: "id:1/id:3",
		nodeId: 5,
		parentNodeId: 3,
		declarationOrder: 4,
		name: "sequential second",
	});
	const plainAfter = createPlannerNode({
		identityKey: "id:1/id:6",
		parentIdentityKey: "id:1",
		nodeId: 6,
		parentNodeId: 1,
		declarationOrder: 5,
		name: "plain after",
	});

	const plan = planExecutionStages([
		createPlannerBranch(0, [
			root,
			plainBefore,
			sequentialSuite,
			sequentialFirst,
			sequentialSecond,
			plainAfter,
		]),
	]);

	assert.equal(plan.complete, true);
	assert.deepEqual(
		plan.stages.map((stage) => stage.map((target) => target.node.name)),
		[
			["plain before", "sequential first", "plain after"],
			["sequential second"],
		],
	);
});

test("planExecutionStages keeps runnable ancestors ahead of nested descendants", () => {
	const root = createPlannerNode({
		identityKey: "id:10",
		nodeId: 10,
		declarationOrder: 0,
		kind: 2,
		name: "root suite",
	});
	const parent = createPlannerNode({
		identityKey: "id:10/id:11",
		parentIdentityKey: "id:10",
		nodeId: 11,
		parentNodeId: 10,
		declarationOrder: 1,
		name: "parent test",
	});
	const child = createPlannerNode({
		identityKey: "id:10/id:11/id:12",
		parentIdentityKey: "id:10/id:11",
		nodeId: 12,
		parentNodeId: 11,
		declarationOrder: 2,
		name: "child test",
	});

	const plan = planExecutionStages([
		createPlannerBranch(0, [root, parent, child]),
	]);

	assert.equal(plan.complete, true);
	assert.deepEqual(
		plan.stages.map((stage) => stage.map((target) => target.node.name)),
		[["parent test"], ["child test"]],
	);
});

test("planExecutionStages blocks dependents when a dependency target is missing", () => {
	const root = createPlannerNode({
		identityKey: "id:20",
		nodeId: 20,
		declarationOrder: 0,
		kind: 2,
		name: "root suite",
	});
	const passingPrereq = createPlannerNode({
		identityKey: "id:20/id:21",
		parentIdentityKey: "id:20",
		nodeId: 21,
		parentNodeId: 20,
		declarationOrder: 1,
		name: "passing prereq",
	});
	const blockedMissing = createPlannerNode({
		identityKey: "id:20/id:22",
		parentIdentityKey: "id:20",
		nodeId: 22,
		parentNodeId: 20,
		declarationOrder: 2,
		dependencyKeys: ["id:missing"],
		name: "blocked missing",
	});
	const transitivelyBlocked = createPlannerNode({
		identityKey: "id:20/id:23",
		parentIdentityKey: "id:20",
		nodeId: 23,
		parentNodeId: 20,
		declarationOrder: 3,
		dependencyKeys: ["id:20/id:22"],
		name: "transitively blocked",
	});
	const plainReady = createPlannerNode({
		identityKey: "id:20/id:24",
		parentIdentityKey: "id:20",
		nodeId: 24,
		parentNodeId: 20,
		declarationOrder: 4,
		name: "plain ready",
	});

	const plan = planExecutionStages([
		createPlannerBranch(0, [
			root,
			passingPrereq,
			blockedMissing,
			transitivelyBlocked,
			plainReady,
		]),
	]);

	assert.equal(plan.complete, false);
	assert.deepEqual(
		plan.stages.map((stage) => stage.map((target) => target.node.name)),
		[["passing prereq", "plain ready"]],
	);
	assert.deepEqual(
		plan.blockedTargets.map((target) => target.node.name),
		["blocked missing", "transitively blocked"],
	);
	assert.deepEqual(plan.issues, [
		{
			type: "missing-dependency",
			targetIdentityKey: "id:20/id:22",
			dependencyIdentityKey: "id:missing",
		},
	]);
});

test("planExecutionStages resolves dependencyNodeIds onto discovered targets", () => {
	const root = createPlannerNode({
		identityKey: "id:25",
		nodeId: 25,
		declarationOrder: 0,
		kind: 2,
		name: "root suite",
	});
	const prereq = createPlannerNode({
		identityKey: "id:25/id:26",
		parentIdentityKey: "id:25",
		nodeId: 26,
		parentNodeId: 25,
		declarationOrder: 1,
		name: "prereq",
	});
	const dependent = createPlannerNode({
		identityKey: "id:25/id:27",
		parentIdentityKey: "id:25",
		nodeId: 27,
		parentNodeId: 25,
		declarationOrder: 2,
		dependencyNodeIds: [26, 26],
		name: "dependent",
	});

	const plan = planExecutionStages([
		createPlannerBranch(0, [root, prereq, dependent]),
	]);

	assert.equal(plan.complete, true);
	assert.deepEqual(
		plan.stages.map((stage) => stage.map((target) => target.node.name)),
		[["prereq"], ["dependent"]],
	);
	assert.deepEqual(plan.issues, []);
});

test("planExecutionStages does not resolve repeated local nodeIds across unrelated scopes", () => {
	const otherRoot = createPlannerNode({
		identityKey: "id:28",
		nodeId: 28,
		declarationOrder: 0,
		kind: 2,
		name: "other root",
	});
	const otherNested = createPlannerNode({
		identityKey: "id:28/id:29",
		parentIdentityKey: "id:28",
		nodeId: 29,
		parentNodeId: 28,
		declarationOrder: 1,
		name: "other nested",
	});
	const focusedParent = createPlannerNode({
		identityKey: "id:30",
		nodeId: 30,
		declarationOrder: 2,
		kind: 2,
		name: "focused suite",
	});
	const focusedDependent = createPlannerNode({
		identityKey: "id:30/id:31",
		parentIdentityKey: "id:30",
		nodeId: 31,
		parentNodeId: 30,
		declarationOrder: 3,
		dependencyNodeIds: [29],
		name: "focused dependent",
	});

	const plan = planExecutionStages([
		createPlannerBranch(0, [otherRoot, otherNested]),
		createPlannerBranch(1, [focusedParent, focusedDependent]),
	]);

	assert.equal(plan.complete, false);
	assert.deepEqual(
		plan.stages.map((stage) => stage.map((target) => target.node.name)),
		[["other nested"]],
	);
	assert.deepEqual(
		plan.blockedTargets.map((target) => target.node.name),
		["focused dependent"],
	);
	assert.deepEqual(plan.issues, [
		{
			type: "missing-dependency",
			targetIdentityKey: "id:30/id:31",
			dependencyIdentityKey: "nodeId:29",
		},
	]);
});

test("planExecutionStages reports missing dependencyNodeIds with blocked dependents", () => {
	const root = createPlannerNode({
		identityKey: "id:28",
		nodeId: 28,
		declarationOrder: 0,
		kind: 2,
		name: "root suite",
	});
	const dependent = createPlannerNode({
		identityKey: "id:28/id:29",
		parentIdentityKey: "id:28",
		nodeId: 29,
		parentNodeId: 28,
		declarationOrder: 1,
		dependencyNodeIds: [999],
		name: "dependent",
	});

	const plan = planExecutionStages([createPlannerBranch(0, [root, dependent])]);

	assert.equal(plan.complete, false);
	assert.deepEqual(plan.stages, []);
	assert.deepEqual(
		plan.blockedTargets.map((target) => target.node.name),
		["dependent"],
	);
	assert.deepEqual(plan.issues, [
		{
			type: "missing-dependency",
			targetIdentityKey: "id:28/id:29",
			dependencyIdentityKey: "nodeId:999",
		},
	]);
});

test("planExecutionStages reports dependency cycles after planning ready nodes", () => {
	const root = createPlannerNode({
		identityKey: "id:30",
		nodeId: 30,
		declarationOrder: 0,
		kind: 2,
		name: "root suite",
	});
	const cycleA = createPlannerNode({
		identityKey: "id:30/id:31",
		parentIdentityKey: "id:30",
		nodeId: 31,
		parentNodeId: 30,
		declarationOrder: 1,
		dependencyKeys: ["id:30/id:32"],
		name: "cycle a",
	});
	const cycleB = createPlannerNode({
		identityKey: "id:30/id:32",
		parentIdentityKey: "id:30",
		nodeId: 32,
		parentNodeId: 30,
		declarationOrder: 2,
		dependencyKeys: ["id:30/id:31"],
		name: "cycle b",
	});
	const plainReady = createPlannerNode({
		identityKey: "id:30/id:33",
		parentIdentityKey: "id:30",
		nodeId: 33,
		parentNodeId: 30,
		declarationOrder: 3,
		name: "plain ready",
	});

	const plan = planExecutionStages([
		createPlannerBranch(0, [root, cycleA, cycleB, plainReady]),
	]);

	assert.equal(plan.complete, false);
	assert.deepEqual(
		plan.stages.map((stage) => stage.map((target) => target.node.name)),
		[["plain ready"]],
	);
	assert.deepEqual(
		plan.blockedTargets.map((target) => target.node.name),
		["cycle a", "cycle b"],
	);
	assert.deepEqual(plan.issues, [
		{
			type: "dependency-cycle",
			targetIdentityKey: "id:30/id:31",
			dependencyIdentityKey: "",
		},
		{
			type: "dependency-cycle",
			targetIdentityKey: "id:30/id:32",
			dependencyIdentityKey: "",
		},
	]);
});

test("classifyDependencyOutcome treats expected failures as satisfied only when they fail", () => {
	const plainTarget = {
		node: { expectFailure: false },
	};
	const expectedFailureTarget = {
		node: { expectFailure: true },
	};

	assert.equal(classifyDependencyOutcome(plainTarget, { ok: true }), "satisfied");
	assert.equal(classifyDependencyOutcome(plainTarget, { ok: false }), "unsatisfied");
	assert.equal(
		classifyDependencyOutcome(expectedFailureTarget, { ok: false }),
		"satisfied",
	);
	assert.equal(
		classifyDependencyOutcome(expectedFailureTarget, { ok: true }),
		"unsatisfied",
	);
});

test("evaluatePlannedExecution blocks downstream dependents after an unsatisfied prerequisite", () => {
	const root = createPlannerNode({
		identityKey: "id:40",
		nodeId: 40,
		declarationOrder: 0,
		kind: 2,
		name: "root suite",
	});
	const expectedFailurePrereq = createPlannerNode({
		identityKey: "id:40/id:41",
		parentIdentityKey: "id:40",
		nodeId: 41,
		parentNodeId: 40,
		declarationOrder: 1,
		expectFailure: true,
		name: "expected failure prereq",
	});
	const directDependent = createPlannerNode({
		identityKey: "id:40/id:42",
		parentIdentityKey: "id:40",
		nodeId: 42,
		parentNodeId: 40,
		declarationOrder: 2,
		dependencyKeys: ["id:40/id:41"],
		name: "direct dependent",
	});
	const downstreamDependent = createPlannerNode({
		identityKey: "id:40/id:43",
		parentIdentityKey: "id:40",
		nodeId: 43,
		parentNodeId: 40,
		declarationOrder: 3,
		dependencyKeys: ["id:40/id:42"],
		name: "downstream dependent",
	});

	const plan = planExecutionStages([
		createPlannerBranch(0, [
			root,
			expectedFailurePrereq,
			directDependent,
			downstreamDependent,
		]),
	]);
	const evaluated = evaluatePlannedExecution(
		plan,
		new Map([
			["id:40/id:41", { ok: true }],
			["id:40/id:42", { ok: true }],
			["id:40/id:43", { ok: true }],
		]),
	);

	assert.equal(evaluated.outcomesByIdentity.get("id:40/id:41"), "unsatisfied");
	assert.equal(evaluated.outcomesByIdentity.get("id:40/id:42"), "blocked");
	assert.equal(evaluated.outcomesByIdentity.get("id:40/id:43"), "blocked");
	assert.deepEqual(
		evaluated.blockedTargets.map((target) => target.node.name),
		["direct dependent", "downstream dependent"],
	);
	assert.deepEqual(
		evaluated.issues.filter((issue) => issue.type === "blocked-dependency"),
		[
			{
				type: "blocked-dependency",
				targetIdentityKey: "id:40/id:42",
				dependencyIdentityKey: "id:40/id:41",
			},
			{
				type: "blocked-dependency",
				targetIdentityKey: "id:40/id:43",
				dependencyIdentityKey: "id:40/id:41",
			},
		],
	);
});

test("decorateHarness can execute start() in-band and merge coverage snapshots", async () => {
	let nextHarnessId = 1;
	const runHarnessIds = [];

	function createCoverageSnapshot(id) {
		return {
			points: [
				{
					id,
					file: `instance-${id}.ts`,
					line: 1,
					column: 1,
					coverType: 1,
				},
			],
			coveredIds: [id],
		};
	}

	function createLocalHarness() {
		const harnessId = nextHarnessId++;
		const callbacks = {
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

		function emit(type, event) {
			if (typeof callbacks[type] === "function") {
				callbacks[type](event);
			}
		}

		return {
			onNodeFound(callback) {
				callbacks.nodeFound = callback;
			},
			onNodeStart(callback) {
				callbacks.nodeStart = callback;
			},
			onNodePass(callback) {
				callbacks.nodePass = callback;
			},
			onNodeFail(callback) {
				callbacks.nodeFail = callback;
			},
			onFailMessage(callback) {
				callbacks.failMessage = callback;
			},
			onCallbackStart(callback) {
				callbacks.callbackStart = callback;
			},
			onCallbackPass(callback) {
				callbacks.callbackPass = callback;
			},
			onCallbackFail(callback) {
				callbacks.callbackFail = callback;
			},
			onDiagnostic(callback) {
				callbacks.diagnostic = callback;
			},
			onLog(callback) {
				callbacks.log = callback;
			},
			discover(nodeIndex) {
				switch (Array.isArray(nodeIndex) ? nodeIndex.join(".") : "<invalid>") {
					case "":
						emit("nodeFound", {
							nodeIndex: [0],
							nodeId: 1,
							parentNodeId: 0,
							declarationOrder: 0,
							sequenceMode: 0,
							dependencyNodeIds: [],
							only: false,
							expectFailure: false,
							kind: 2,
							declarationMode: 1,
							name: "root suite",
						});
						return true;
					case "0":
						emit("nodeFound", {
							nodeIndex: [0, 0],
							nodeId: 2,
							parentNodeId: 1,
							declarationOrder: 1,
							sequenceMode: 0,
							dependencyNodeIds: [],
							only: false,
							expectFailure: false,
							kind: 1,
							declarationMode: 1,
							name: "leaf test",
						});
						return true;
					case "0.0":
						return false;
					default:
						return true;
				}
			},
			run(nodeIndex) {
				runHarnessIds.push(harnessId);
				emit("nodeStart", { nodeIndex: Array.isArray(nodeIndex) ? nodeIndex : [] });
				emit("nodePass", { nodeIndex: Array.isArray(nodeIndex) ? nodeIndex : [] });
				return true;
			},
			getCoverageSnapshot() {
				return createCoverageSnapshot(harnessId);
			},
			resetCoverage() {},
			close() {},
		};
	}

	const harness = decorateHarness(
		{},
		{
			bytes: Buffer.alloc(0),
			createLocalHarness,
			runInBand: true,
			workerModulePath: __filename,
		},
	);

	const result = await harness.start();

	assert.equal(result.ok, true);
	assert.equal(result.discoveryOk, true);
	assert.equal(result.planningOk, true);
	assert.equal(result.workerCount, 1);
	assert.deepEqual(runHarnessIds, [2]);
	assert.deepEqual(
		result.coverage,
		{
			points: [
				{ id: 1, file: "instance-1.ts", line: 1, column: 1, coverType: 1 },
				{ id: 2, file: "instance-2.ts", line: 1, column: 1, coverType: 1 },
			],
			coveredIds: [1, 2],
		},
	);
});
