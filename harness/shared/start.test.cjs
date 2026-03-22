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
			preferredRunnerMode: options.preferredRunnerMode ?? 0,
			preferredFailurePolicy: options.preferredFailurePolicy ?? 0,
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
			issueLabel: "missing prerequisite",
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

test("planExecutionStages collapses duplicate dependency edges from mixed metadata", () => {
	const root = createPlannerNode({
		identityKey: "id:26",
		nodeId: 26,
		declarationOrder: 0,
		kind: 2,
		name: "root suite",
	});
	const prereq = createPlannerNode({
		identityKey: "id:26/id:27",
		parentIdentityKey: "id:26",
		nodeId: 27,
		parentNodeId: 26,
		declarationOrder: 1,
		name: "prereq",
	});
	const dependent = createPlannerNode({
		identityKey: "id:26/id:28",
		parentIdentityKey: "id:26",
		nodeId: 28,
		parentNodeId: 26,
		declarationOrder: 2,
		dependencyKeys: ["id:26/id:27", "id:26/id:27"],
		dependencyNodeIds: [27, 27],
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
	assert.deepEqual(Array.from(plan.adjacency.get("id:26/id:27") || []), [
		"id:26/id:28",
	]);
	assert.deepEqual(plan.issues, []);
});

test("planExecutionStages applies global topological ordering with declaration-order tie-breaks", () => {
	const firstRoot = createPlannerNode({
		identityKey: "id:80",
		nodeId: 80,
		declarationOrder: 0,
		kind: 2,
		name: "first root",
	});
	const lateIndependent = createPlannerNode({
		identityKey: "id:80/id:84",
		parentIdentityKey: "id:80",
		nodeId: 84,
		parentNodeId: 80,
		declarationOrder: 4,
		name: "late independent",
	});
	const crossBranchDependent = createPlannerNode({
		identityKey: "id:80/id:86",
		parentIdentityKey: "id:80",
		nodeId: 86,
		parentNodeId: 80,
		declarationOrder: 6,
		dependencyKeys: ["id:81/id:82"],
		name: "cross-branch dependent",
	});

	const secondRoot = createPlannerNode({
		identityKey: "id:81",
		nodeId: 81,
		declarationOrder: 10,
		kind: 2,
		name: "second root",
	});
	const earlyIndependent = createPlannerNode({
		identityKey: "id:81/id:81a",
		parentIdentityKey: "id:81",
		nodeId: 811,
		parentNodeId: 81,
		declarationOrder: 1,
		name: "early independent",
	});
	const sharedPrereq = createPlannerNode({
		identityKey: "id:81/id:82",
		parentIdentityKey: "id:81",
		nodeId: 82,
		parentNodeId: 81,
		declarationOrder: 2,
		name: "shared prereq",
	});
	const sameBranchDependent = createPlannerNode({
		identityKey: "id:81/id:85",
		parentIdentityKey: "id:81",
		nodeId: 85,
		parentNodeId: 81,
		declarationOrder: 5,
		dependencyKeys: ["id:81/id:82"],
		name: "same-branch dependent",
	});

	const thirdRoot = createPlannerNode({
		identityKey: "id:83",
		nodeId: 83,
		declarationOrder: 20,
		kind: 2,
		name: "third root",
	});
	const middleIndependent = createPlannerNode({
		identityKey: "id:83/id:83a",
		parentIdentityKey: "id:83",
		nodeId: 831,
		parentNodeId: 83,
		declarationOrder: 3,
		name: "middle independent",
	});

	const plan = planExecutionStages([
		createPlannerBranch(0, [firstRoot, lateIndependent, crossBranchDependent]),
		createPlannerBranch(1, [
			secondRoot,
			earlyIndependent,
			sharedPrereq,
			sameBranchDependent,
		]),
		createPlannerBranch(2, [thirdRoot, middleIndependent]),
	]);

	assert.equal(plan.complete, true);
	assert.deepEqual(
		plan.stages.map((stage) => stage.map((target) => target.node.name)),
		[
			[
				"early independent",
				"shared prereq",
				"middle independent",
				"late independent",
			],
			["same-branch dependent", "cross-branch dependent"],
		],
	);
	assert.deepEqual(plan.blockedTargets, []);
	assert.deepEqual(plan.issues, []);
});

test("planExecutionStages keeps declaration-order ties stable using identity keys instead of nodeIndex", () => {
	const branchOne = createPlannerNode({
		identityKey: "id:9",
		nodeId: 9,
		declarationOrder: 0,
		kind: 2,
		name: "root nine",
	});
	const branchOneLeaf = createPlannerNode({
		identityKey: "id:9/id:42",
		parentIdentityKey: "id:9",
		nodeId: 42,
		parentNodeId: 9,
		declarationOrder: 2,
		nodeIndex: [10, 0],
		name: "stable identity before index",
	});
	const branchTwo = createPlannerNode({
		identityKey: "id:10",
		nodeId: 10,
		declarationOrder: 1,
		kind: 2,
		name: "root ten",
	});
	const branchTwoLeaf = createPlannerNode({
		identityKey: "id:10/id:42",
		parentIdentityKey: "id:10",
		nodeId: 42,
		parentNodeId: 10,
		declarationOrder: 2,
		nodeIndex: [9, 0],
		name: "stable identity after index",
	});

	const plan = planExecutionStages([
		createPlannerBranch(0, [branchOne, branchOneLeaf]),
		createPlannerBranch(1, [branchTwo, branchTwoLeaf]),
	]);

	assert.equal(plan.complete, true);
	assert.deepEqual(
		plan.stages.map((stage) => stage.map((target) => target.node.name)),
		[["stable identity before index", "stable identity after index"]],
	);
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
			issueLabel: "missing prerequisite",
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
			issueLabel: "missing prerequisite",
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
			issueLabel: "dependency cycle",
			targetIdentityKey: "id:30/id:31",
			dependencyIdentityKey: "",
		},
		{
			type: "dependency-cycle",
			issueLabel: "dependency cycle",
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

	assert.equal(
		classifyDependencyOutcome(plainTarget, { ok: true }),
		"satisfied",
	);
	assert.equal(
		classifyDependencyOutcome(plainTarget, { ok: false }),
		"unsatisfied",
	);
	assert.equal(
		classifyDependencyOutcome(expectedFailureTarget, { ok: true }),
		"satisfied",
	);
	assert.equal(
		classifyDependencyOutcome(expectedFailureTarget, { ok: false }),
		"unsatisfied",
	);
});

test("evaluatePlannedExecution keeps unrelated work satisfied while blocking only downstream dependents", () => {
	const root = createPlannerNode({
		identityKey: "id:120",
		nodeId: 120,
		declarationOrder: 0,
		kind: 2,
		name: "root suite",
	});
	const failingPrereq = createPlannerNode({
		identityKey: "id:120/id:121",
		parentIdentityKey: "id:120",
		nodeId: 121,
		parentNodeId: 120,
		declarationOrder: 1,
		name: "failing prereq",
	});
	const blockedDependent = createPlannerNode({
		identityKey: "id:120/id:122",
		parentIdentityKey: "id:120",
		nodeId: 122,
		parentNodeId: 120,
		declarationOrder: 2,
		dependencyKeys: ["id:120/id:121"],
		name: "blocked dependent",
	});
	const unrelatedReady = createPlannerNode({
		identityKey: "id:120/id:123",
		parentIdentityKey: "id:120",
		nodeId: 123,
		parentNodeId: 120,
		declarationOrder: 3,
		name: "unrelated ready",
	});
	const expectedFailurePrereq = createPlannerNode({
		identityKey: "id:120/id:124",
		parentIdentityKey: "id:120",
		nodeId: 124,
		parentNodeId: 120,
		declarationOrder: 4,
		expectFailure: true,
		name: "expected failure prereq",
	});
	const satisfiedDependent = createPlannerNode({
		identityKey: "id:120/id:125",
		parentIdentityKey: "id:120",
		nodeId: 125,
		parentNodeId: 120,
		declarationOrder: 5,
		dependencyKeys: ["id:120/id:124"],
		name: "satisfied dependent",
	});
	const downstreamBlocked = createPlannerNode({
		identityKey: "id:120/id:126",
		parentIdentityKey: "id:120",
		nodeId: 126,
		parentNodeId: 120,
		declarationOrder: 6,
		dependencyKeys: ["id:120/id:122"],
		name: "downstream blocked",
	});

	const plan = planExecutionStages([
		createPlannerBranch(0, [
			root,
			failingPrereq,
			blockedDependent,
			unrelatedReady,
			expectedFailurePrereq,
			satisfiedDependent,
			downstreamBlocked,
		]),
	]);
	const evaluated = evaluatePlannedExecution(
		plan,
		new Map([
			["id:120/id:121", { ok: false }],
			["id:120/id:122", { ok: true }],
			["id:120/id:123", { ok: true }],
			["id:120/id:124", { ok: true }],
			["id:120/id:125", { ok: true }],
			["id:120/id:126", { ok: true }],
		]),
	);

	assert.equal(
		evaluated.outcomesByIdentity.get("id:120/id:121"),
		"unsatisfied",
	);
	assert.equal(evaluated.outcomesByIdentity.get("id:120/id:122"), "blocked");
	assert.equal(evaluated.outcomesByIdentity.get("id:120/id:123"), "satisfied");
	assert.equal(evaluated.outcomesByIdentity.get("id:120/id:124"), "satisfied");
	assert.equal(evaluated.outcomesByIdentity.get("id:120/id:125"), "satisfied");
	assert.equal(evaluated.outcomesByIdentity.get("id:120/id:126"), "blocked");
	assert.deepEqual(
		evaluated.blockedTargets.map((target) => target.node.name),
		["blocked dependent", "downstream blocked"],
	);
	assert.deepEqual(
		evaluated.issues.filter((issue) => issue.type === "blocked-dependency"),
		[
			{
				type: "blocked-dependency",
				issueLabel: "blocked by prerequisite",
				targetIdentityKey: "id:120/id:122",
				dependencyIdentityKey: "id:120/id:121",
			},
			{
				type: "blocked-dependency",
				issueLabel: "blocked by prerequisite",
				targetIdentityKey: "id:120/id:126",
				dependencyIdentityKey: "id:120/id:121",
			},
		],
	);
});

test("evaluatePlannedExecution applies bail only within the nearest hinted scope", () => {
	const root = createPlannerNode({
		identityKey: "id:130",
		nodeId: 130,
		declarationOrder: 0,
		kind: 2,
		name: "root suite",
	});
	const bailSuite = createPlannerNode({
		identityKey: "id:130/id:131",
		parentIdentityKey: "id:130",
		nodeId: 131,
		parentNodeId: 130,
		declarationOrder: 1,
		kind: 2,
		preferredFailurePolicy: 2,
		name: "bail suite",
	});
	const failingLeaf = createPlannerNode({
		identityKey: "id:130/id:131/id:132",
		parentIdentityKey: "id:130/id:131",
		nodeId: 132,
		parentNodeId: 131,
		declarationOrder: 2,
		name: "failing leaf",
	});
	const bailedSibling = createPlannerNode({
		identityKey: "id:130/id:131/id:133",
		parentIdentityKey: "id:130/id:131",
		nodeId: 133,
		parentNodeId: 131,
		declarationOrder: 3,
		name: "bailed sibling",
	});
	const continueSuite = createPlannerNode({
		identityKey: "id:130/id:131/id:134",
		parentIdentityKey: "id:130/id:131",
		nodeId: 134,
		parentNodeId: 131,
		declarationOrder: 4,
		kind: 2,
		preferredFailurePolicy: 1,
		name: "continue suite",
	});
	const continuedLeaf = createPlannerNode({
		identityKey: "id:130/id:131/id:134/id:135",
		parentIdentityKey: "id:130/id:131/id:134",
		nodeId: 135,
		parentNodeId: 134,
		declarationOrder: 5,
		name: "continued leaf",
	});
	const unrelatedLeaf = createPlannerNode({
		identityKey: "id:130/id:136",
		parentIdentityKey: "id:130",
		nodeId: 136,
		parentNodeId: 130,
		declarationOrder: 6,
		name: "unrelated leaf",
	});

	const plan = planExecutionStages([
		createPlannerBranch(0, [
			root,
			bailSuite,
			failingLeaf,
			bailedSibling,
			continueSuite,
			continuedLeaf,
			unrelatedLeaf,
		]),
	]);
	const evaluated = evaluatePlannedExecution(
		plan,
		new Map([
			["id:130/id:131/id:132", { ok: false }],
			["id:130/id:131/id:133", { ok: true }],
			["id:130/id:131/id:134/id:135", { ok: true }],
			["id:130/id:136", { ok: true }],
		]),
	);

	assert.equal(
		evaluated.outcomesByIdentity.get("id:130/id:131/id:132"),
		"unsatisfied",
	);
	assert.equal(
		evaluated.outcomesByIdentity.get("id:130/id:131/id:133"),
		"blocked",
	);
	assert.equal(
		evaluated.outcomesByIdentity.get("id:130/id:131/id:134/id:135"),
		"satisfied",
	);
	assert.equal(evaluated.outcomesByIdentity.get("id:130/id:136"), "satisfied");
	assert.deepEqual(
		evaluated.issues.filter((issue) => issue.type === "bailed"),
		[
			{
				type: "bailed",
				issueLabel: "stopped after failure",
				targetIdentityKey: "id:130/id:131/id:133",
				dependencyIdentityKey: "id:130/id:131/id:132",
			},
		],
	);
});

test("planExecutionStages surfaces ignored unsupported hint metadata without blocking runnable work", () => {
	const root = createPlannerNode({
		identityKey: "id:150",
		nodeId: 150,
		declarationOrder: 0,
		kind: 2,
		preferredRunnerMode: 9,
		name: "root suite",
	});
	const child = createPlannerNode({
		identityKey: "id:150/id:151",
		parentIdentityKey: "id:150",
		nodeId: 151,
		parentNodeId: 150,
		declarationOrder: 1,
		preferredFailurePolicy: 7,
		name: "plain child",
	});

	const plan = planExecutionStages([createPlannerBranch(0, [root, child])]);

	assert.equal(plan.complete, true);
	assert.deepEqual(
		plan.stages.map((stage) => stage.map((target) => target.node.name)),
		[["plain child"]],
	);
	assert.deepEqual(plan.blockedTargets, []);
	assert.deepEqual(
		plan.issues.filter((issue) => issue.type === "ignored-hint"),
		[
			{
				type: "ignored-hint",
				issueLabel: "ignored hint",
				targetIdentityKey: "id:150",
				dependencyIdentityKey: "",
				hintName: "preferredRunnerMode",
				hintValue: 9,
			},
			{
				type: "ignored-hint",
				issueLabel: "ignored hint",
				targetIdentityKey: "id:150/id:151",
				dependencyIdentityKey: "",
				hintName: "preferredFailurePolicy",
				hintValue: 7,
			},
		],
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
			["id:40/id:41", { ok: false }],
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
				issueLabel: "blocked by prerequisite",
				targetIdentityKey: "id:40/id:42",
				dependencyIdentityKey: "id:40/id:41",
			},
			{
				type: "blocked-dependency",
				issueLabel: "blocked by prerequisite",
				targetIdentityKey: "id:40/id:43",
				dependencyIdentityKey: "id:40/id:41",
			},
		],
	);
});

test("evaluatePlannedExecution blocks execution targets with missing execution results", () => {
	const root = createPlannerNode({
		identityKey: "id:50",
		nodeId: 50,
		declarationOrder: 0,
		kind: 2,
		name: "root suite",
	});
	const passingPrereq = createPlannerNode({
		identityKey: "id:50/id:51",
		parentIdentityKey: "id:50",
		nodeId: 51,
		parentNodeId: 50,
		declarationOrder: 1,
		name: "passing prereq",
	});
	const dependent = createPlannerNode({
		identityKey: "id:50/id:52",
		parentIdentityKey: "id:50",
		nodeId: 52,
		parentNodeId: 50,
		declarationOrder: 2,
		dependencyNodeIds: [51],
		name: "dependent",
	});

	const plan = planExecutionStages([
		createPlannerBranch(0, [root, passingPrereq, dependent]),
	]);
	const evaluated = evaluatePlannedExecution(
		plan,
		new Map([["id:50/id:51", { ok: true }]]),
	);

	assert.equal(evaluated.outcomesByIdentity.get("id:50/id:51"), "satisfied");
	assert.equal(evaluated.outcomesByIdentity.get("id:50/id:52"), "blocked");
	assert.deepEqual(evaluated.issues, []);
});

test("planExecutionStages treats skipped dependency declarations as missing dependency targets", () => {
	const root = createPlannerNode({
		identityKey: "id:60",
		nodeId: 60,
		declarationOrder: 0,
		kind: 2,
		name: "root suite",
	});
	const ready = createPlannerNode({
		identityKey: "id:60/id:61",
		parentIdentityKey: "id:60",
		nodeId: 61,
		parentNodeId: 60,
		declarationOrder: 1,
		name: "ready test",
	});
	const skippedPrereq = createPlannerNode({
		identityKey: "id:60/id:62",
		parentIdentityKey: "id:60",
		nodeId: 62,
		parentNodeId: 60,
		declarationOrder: 2,
		declarationMode: 2,
		name: "skipped prereq",
	});
	const blockedDependent = createPlannerNode({
		identityKey: "id:60/id:63",
		parentIdentityKey: "id:60",
		nodeId: 63,
		parentNodeId: 60,
		declarationOrder: 3,
		dependencyNodeIds: [62],
		name: "blocked dependent",
	});

	const plan = planExecutionStages([
		createPlannerBranch(0, [root, ready, skippedPrereq, blockedDependent]),
	]);

	assert.equal(plan.complete, false);
	assert.deepEqual(
		plan.stages.map((stage) => stage.map((target) => target.node.name)),
		[["ready test"]],
	);
	assert.deepEqual(
		plan.blockedTargets.map((target) => target.node.name),
		["blocked dependent"],
	);
	assert.deepEqual(plan.issues, [
		{
			type: "missing-dependency",
			issueLabel: "missing prerequisite",
			targetIdentityKey: "id:60/id:63",
			dependencyIdentityKey: "nodeId:62",
		},
	]);
});

test("planExecutionStages treats todo dependency declarations as missing dependency targets", () => {
	const root = createPlannerNode({
		identityKey: "id:64",
		nodeId: 64,
		declarationOrder: 0,
		kind: 2,
		name: "root suite",
	});
	const ready = createPlannerNode({
		identityKey: "id:64/id:65",
		parentIdentityKey: "id:64",
		nodeId: 65,
		parentNodeId: 64,
		declarationOrder: 1,
		name: "ready test",
	});
	const todoPrereq = createPlannerNode({
		identityKey: "id:64/id:66",
		parentIdentityKey: "id:64",
		nodeId: 66,
		parentNodeId: 64,
		declarationOrder: 2,
		declarationMode: 3,
		name: "todo prereq",
	});
	const blockedDependent = createPlannerNode({
		identityKey: "id:64/id:67",
		parentIdentityKey: "id:64",
		nodeId: 67,
		parentNodeId: 64,
		declarationOrder: 3,
		dependencyNodeIds: [66],
		name: "blocked dependent",
	});

	const plan = planExecutionStages([
		createPlannerBranch(0, [root, ready, todoPrereq, blockedDependent]),
	]);

	assert.equal(plan.complete, false);
	assert.deepEqual(
		plan.stages.map((stage) => stage.map((target) => target.node.name)),
		[["ready test"]],
	);
	assert.deepEqual(
		plan.blockedTargets.map((target) => target.node.name),
		["blocked dependent"],
	);
	assert.deepEqual(plan.issues, [
		{
			type: "missing-dependency",
			issueLabel: "missing prerequisite",
			targetIdentityKey: "id:64/id:67",
			dependencyIdentityKey: "nodeId:66",
		},
	]);
});

test("planExecutionStages treats only-filtered dependency declarations as missing dependency targets", () => {
	const root = createPlannerNode({
		identityKey: "id:68",
		nodeId: 68,
		declarationOrder: 0,
		kind: 2,
		name: "root suite",
	});
	const onlyParent = createPlannerNode({
		identityKey: "id:68/id:69",
		parentIdentityKey: "id:68",
		nodeId: 69,
		parentNodeId: 68,
		declarationOrder: 1,
		kind: 2,
		name: "only parent",
	});
	const ready = createPlannerNode({
		identityKey: "id:68/id:70",
		parentIdentityKey: "id:68",
		nodeId: 70,
		parentNodeId: 68,
		declarationOrder: 2,
		name: "ready test",
	});
	const onlyIncludedDependent = createPlannerNode({
		identityKey: "id:68/id:69/id:72",
		parentIdentityKey: "id:68/id:69",
		nodeId: 72,
		parentNodeId: 69,
		declarationOrder: 4,
		dependencyNodeIds: [71],
		only: true,
		name: "only included dependent",
	});

	const plan = planExecutionStages([
		createPlannerBranch(0, [root, onlyParent, ready, onlyIncludedDependent]),
	]);

	assert.equal(plan.complete, false);
	assert.deepEqual(
		plan.stages.map((stage) => stage.map((target) => target.node.name)),
		[["ready test"]],
	);
	assert.deepEqual(
		plan.blockedTargets.map((target) => target.node.name),
		["only included dependent"],
	);
	assert.deepEqual(plan.issues, [
		{
			type: "missing-dependency",
			issueLabel: "missing prerequisite",
			targetIdentityKey: "id:68/id:69/id:72",
			dependencyIdentityKey: "nodeId:71",
		},
	]);
});

test("planExecutionStages resolves dependencyNodeIds through ancestor scopes", () => {
	const root = createPlannerNode({
		identityKey: "id:90",
		nodeId: 90,
		declarationOrder: 0,
		kind: 2,
		name: "root suite",
	});
	const ancestorPrereq = createPlannerNode({
		identityKey: "id:90/id:91",
		parentIdentityKey: "id:90",
		nodeId: 91,
		parentNodeId: 90,
		declarationOrder: 1,
		name: "ancestor prereq",
	});
	const nestedSuite = createPlannerNode({
		identityKey: "id:90/id:92",
		parentIdentityKey: "id:90",
		nodeId: 92,
		parentNodeId: 90,
		declarationOrder: 2,
		kind: 2,
		name: "nested suite",
	});
	const nestedDependent = createPlannerNode({
		identityKey: "id:90/id:92/id:93",
		parentIdentityKey: "id:90/id:92",
		nodeId: 93,
		parentNodeId: 92,
		declarationOrder: 3,
		dependencyNodeIds: [91],
		name: "nested dependent",
	});

	const plan = planExecutionStages([
		createPlannerBranch(0, [
			root,
			ancestorPrereq,
			nestedSuite,
			nestedDependent,
		]),
	]);

	assert.equal(plan.complete, true);
	assert.deepEqual(
		plan.stages.map((stage) => stage.map((target) => target.node.name)),
		[["ancestor prereq"], ["nested dependent"]],
	);
	assert.deepEqual(plan.blockedTargets, []);
	assert.deepEqual(plan.issues, []);
});

test("planExecutionStages rejects malformed dependency metadata as invalid constraints", () => {
	const root = createPlannerNode({
		identityKey: "id:70",
		nodeId: 70,
		declarationOrder: 0,
		kind: 2,
		name: "root suite",
	});
	const ready = createPlannerNode({
		identityKey: "id:70/id:71",
		parentIdentityKey: "id:70",
		nodeId: 71,
		parentNodeId: 70,
		declarationOrder: 1,
		name: "ready test",
	});
	const malformed = createPlannerNode({
		identityKey: "id:70/id:72",
		parentIdentityKey: "id:70",
		nodeId: 72,
		parentNodeId: 70,
		declarationOrder: 2,
		dependencyKeys: [123, "", null],
		dependencyNodeIds: [-1, 0, "x"],
		name: "malformed dependent",
	});

	const plan = planExecutionStages([
		createPlannerBranch(0, [root, ready, malformed]),
	]);

	assert.equal(plan.complete, false);
	assert.deepEqual(
		plan.stages.map((stage) => stage.map((target) => target.node.name)),
		[["ready test"]],
	);
	assert.deepEqual(
		plan.blockedTargets.map((target) => target.node.name),
		["malformed dependent"],
	);
	assert.deepEqual(plan.issues, [
		{
			type: "invalid-constraint",
			issueLabel: "invalid constraint",
			targetIdentityKey: "id:70/id:72",
			dependencyIdentityKey: "",
		},
	]);
});

test("planExecutionStages rejects unsupported sequence scopes as invalid constraints", () => {
	const invalidSuite = createPlannerNode({
		identityKey: "id:160",
		nodeId: 160,
		declarationOrder: 0,
		kind: 2,
		sequenceMode: 9,
		name: "invalid suite",
	});
	const blockedChildA = createPlannerNode({
		identityKey: "id:160/id:161",
		parentIdentityKey: "id:160",
		nodeId: 161,
		parentNodeId: 160,
		declarationOrder: 1,
		name: "blocked child a",
	});
	const blockedChildB = createPlannerNode({
		identityKey: "id:160/id:162",
		parentIdentityKey: "id:160",
		nodeId: 162,
		parentNodeId: 160,
		declarationOrder: 2,
		name: "blocked child b",
	});
	const plainRoot = createPlannerNode({
		identityKey: "id:170",
		nodeId: 170,
		declarationOrder: 3,
		kind: 2,
		name: "plain root",
	});
	const readyChild = createPlannerNode({
		identityKey: "id:170/id:171",
		parentIdentityKey: "id:170",
		nodeId: 171,
		parentNodeId: 170,
		declarationOrder: 4,
		name: "plain ready child",
	});

	const plan = planExecutionStages([
		createPlannerBranch(0, [invalidSuite, blockedChildA, blockedChildB]),
		createPlannerBranch(1, [plainRoot, readyChild]),
	]);

	assert.equal(plan.complete, false);
	assert.deepEqual(
		plan.stages.map((stage) => stage.map((target) => target.node.name)),
		[["plain ready child"]],
	);
	assert.deepEqual(
		plan.blockedTargets.map((target) => target.node.name),
		["blocked child a", "blocked child b"],
	);
	assert.deepEqual(plan.issues, [
		{
			type: "invalid-constraint",
			issueLabel: "invalid constraint",
			targetIdentityKey: "id:160/id:161",
			dependencyIdentityKey: "",
		},
		{
			type: "invalid-constraint",
			issueLabel: "invalid constraint",
			targetIdentityKey: "id:160/id:162",
			dependencyIdentityKey: "",
		},
	]);
});

test("evaluatePlannedExecution keeps pre-blocked targets blocked even with execution results", () => {
	const root = createPlannerNode({
		identityKey: "id:80",
		nodeId: 80,
		declarationOrder: 0,
		kind: 2,
		name: "root suite",
	});
	const blockedTarget = createPlannerNode({
		identityKey: "id:80/id:81",
		parentIdentityKey: "id:80",
		nodeId: 81,
		parentNodeId: 80,
		declarationOrder: 1,
		dependencyKeys: ["id:missing"],
		name: "pre-blocked target",
	});
	const sibling = createPlannerNode({
		identityKey: "id:80/id:82",
		parentIdentityKey: "id:80",
		nodeId: 82,
		parentNodeId: 80,
		declarationOrder: 2,
		name: "sibling",
	});

	const plan = planExecutionStages([
		createPlannerBranch(0, [root, blockedTarget, sibling]),
	]);
	const evaluated = evaluatePlannedExecution(
		plan,
		new Map([
			["id:80/id:81", { ok: true }],
			["id:80/id:82", { ok: true }],
			["id:80/id:999", { ok: false }],
		]),
	);

	assert.equal(plan.complete, false);
	assert.deepEqual(evaluated.issues, [
		{
			type: "missing-dependency",
			issueLabel: "missing prerequisite",
			targetIdentityKey: "id:80/id:81",
			dependencyIdentityKey: "id:missing",
		},
	]);
	assert.equal(evaluated.outcomesByIdentity.get("id:80/id:81"), "blocked");
	assert.equal(evaluated.outcomesByIdentity.get("id:80/id:82"), "satisfied");
	assert.deepEqual(
		evaluated.blockedTargets.map((target) => target.node.name),
		["pre-blocked target"],
	);
	assert.equal(evaluated.blockedTargets.length, 1);
});

test("decorateHarness can execute start() in-band and merge coverage snapshots", async () => {
	let nextHarnessId = 1;
	const runHarnessIds = [];
	const runNodeIndexes = [];

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
				runNodeIndexes.push(Array.isArray(nodeIndex) ? nodeIndex : []);
				emit("nodeStart", {
					nodeIndex: Array.isArray(nodeIndex) ? nodeIndex : [],
				});
				emit("nodePass", {
					nodeIndex: Array.isArray(nodeIndex) ? nodeIndex : [],
				});
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
	assert(result.workerCount >= 1);
	assert.deepEqual(result.metadata, {
		ok: result.ok,
		discoveryOk: result.discoveryOk,
		planningOk: result.planningOk,
		discoveredTestCount: result.discoveredTestCount,
		topLevelNodes: result.topLevelNodes,
		workerCount: result.workerCount,
		planIssues: result.planIssues,
		blocked: result.blocked,
		coverage: result.coverage,
	});
	assert.notStrictEqual(result.metadata, result);
	assert.notStrictEqual(result.metadata.topLevelNodes, result.topLevelNodes);
	assert.notStrictEqual(result.metadata.planIssues, result.planIssues);
	assert.notStrictEqual(result.metadata.blocked, result.blocked);
	assert.notStrictEqual(result.metadata.coverage, result.coverage);
	assert.deepEqual(runHarnessIds, [2]);
	assert.deepEqual(runNodeIndexes, [[0, 0]]);
	assert.deepEqual(result.coverage, {
		points: [
			{ id: 1, file: "instance-1.ts", line: 1, column: 1, coverType: 1 },
			{ id: 2, file: "instance-2.ts", line: 1, column: 1, coverType: 1 },
		],
		coveredIds: [1, 2],
	});
	result.topLevelNodes.pop();
	result.coverage.coveredIds.push(99);
	assert.equal(result.metadata.topLevelNodes.length, 1);
	assert.deepEqual(result.metadata.coverage.coveredIds, [1, 2]);
});
