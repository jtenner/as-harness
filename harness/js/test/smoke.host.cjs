const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const addon = require("..");
const {
	decorateHarness,
	planExecutionStages,
	setNodeIdentity,
} = require("../../shared/start.cjs");
const {
	compileSmokeFixtures,
	registerHarnessSmokeSuite,
} = require("../../shared/smoke-suite.cjs");
const {
	createHarness: createParallelStartHarness,
} = require("./fixtures/parallel-start-harness.cjs");
const {
	createHarness: createNestedIdentityHarness,
} = require("./fixtures/nested-identity-harness.cjs");
const {
	createHarness: createSequentialStartHarness,
} = require("./fixtures/sequential-start-harness.cjs");

const repoDir = path.resolve(__dirname, "..", "..", "..");
const parallelStartHarnessModulePath = path.join(
	__dirname,
	"fixtures",
	"parallel-start-harness.cjs",
);
const nestedIdentityHarnessModulePath = path.join(
	__dirname,
	"fixtures",
	"nested-identity-harness.cjs",
);
const sequentialStartHarnessModulePath = path.join(
	__dirname,
	"fixtures",
	"sequential-start-harness.cjs",
);

const fixtures = compileSmokeFixtures({
	cacheDir: path.join(repoDir, "harness", "js", ".cache"),
	repoDir,
});

registerHarnessSmokeSuite({
	addon,
	assert,
	test,
	...fixtures,
});

function createPlannerNode(options) {
	return setNodeIdentity(
		{
			nodeIndex: options.nodeIndex ?? [],
			nodeId: options.nodeId ?? 0,
			parentNodeId: options.parentNodeId ?? 0,
			declarationOrder: options.declarationOrder ?? 0,
			sequenceMode: options.sequenceMode ?? 0,
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

test("start() runs per-branch execution in worker threads like wazero", async () => {
	const harness = decorateHarness(createParallelStartHarness(), {
		bytes: Buffer.alloc(0),
		createLocalHarness: createParallelStartHarness,
		workerModulePath: parallelStartHarnessModulePath,
	});

	const result = await harness.start();

	assert.equal(result.discoveryOk, true);
	assert.equal(result.ok, true);
	assert.equal(result.branches.length, 2);
	assert.ok(result.workerCount >= 1);
	for (const branch of result.branches) {
		const diagnosticEvent = branch.executions[0].events.find(
			(event) => event.type === "diagnostic",
		);
		assert.match(diagnosticEvent?.data?.message ?? "", /^run-thread-[1-9][0-9]*$/);
	}

	harness.close();
});

test("start() preserves empty coverage snapshots when coverage is enabled", async () => {
	const harness = decorateHarness(createParallelStartHarness(), {
		bytes: Buffer.alloc(0),
		createLocalHarness: createParallelStartHarness,
		workerModulePath: parallelStartHarnessModulePath,
	});

	const result = await harness.start();

	assert.deepEqual(result.coverage, {
		points: [],
		coveredIds: [],
	});

	harness.close();
});

test("start() keeps deep replayed descendants distinct when local node ids repeat", async () => {
	const harness = decorateHarness(createNestedIdentityHarness(), {
		bytes: Buffer.alloc(0),
		createLocalHarness: createNestedIdentityHarness,
		workerModulePath: nestedIdentityHarnessModulePath,
	});

	const result = await harness.start();
	const branch = result.branches[0];

	assert.equal(result.discoveryOk, true);
	assert.equal(result.ok, true);
	assert.equal(result.discoveredTestCount, 2);
	assert.equal(result.topLevelNodes.length, 1);
	assert.deepEqual(
		branch.discovery.nodes.map((node) => node.name),
		[
			"branch",
			"left suite",
			"right suite",
			"left nested suite",
			"right nested suite",
			"left leaf",
			"right leaf",
		],
	);
	assert.deepEqual(
		branch.discovery.nodes
			.filter((node) => node.kind === 1)
			.map((node) => [node.name, node.nodeId, node.parentNodeId]),
		[
			["left leaf", 5, 4],
			["right leaf", 5, 4],
		],
	);
	assert.deepEqual(
		branch.executions.map((execution) => execution.node.name),
		["left leaf", "right leaf"],
	);

	harness.close();
});

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

test("start() executes sequential-scope branches without forcing root barriers", async () => {
	const harness = decorateHarness(createSequentialStartHarness(), {
		bytes: Buffer.alloc(0),
		createLocalHarness: createSequentialStartHarness,
		workerModulePath: sequentialStartHarnessModulePath,
	});

	const result = await harness.start();

	assert.equal(result.discoveryOk, true);
	assert.equal(result.ok, true);
	assert.ok(result.workerCount >= 1);
	assert.deepEqual(
		result.branches.map((branch) => branch.executions.map((execution) => execution.node.name)),
		[
			["branch-a-child"],
			["branch-b-child"],
			["branch-c-child"],
			["branch-d-child"],
			["branch-e-child"],
		],
	);

	harness.close();
});
