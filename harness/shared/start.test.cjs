"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
	classifyDependencyOutcome,
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
