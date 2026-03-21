const assert = require("node:assert/strict");
const path = require("node:path");
const { availableParallelism } = require("node:os");
const test = require("node:test");

const addon = require("..");
const { decorateHarness } = require("../../shared/start.cjs");
const {
	registerSharedStartPlannerSmokeSuite,
} = require("../../shared/start-planner-smoke.cjs");
const {
	compileSmokeFixtures,
	registerHarnessSmokeSuite,
} = require("../../shared/smoke-suite.cjs");
const {
	createHarness: createParallelStartHarness,
} = require("../../shared/fixtures/parallel-ready-harness.cjs");
const {
	createHarness: createNestedIdentityHarness,
} = require("./fixtures/nested-identity-harness.cjs");
const {
	createHarness: createSequentialStartHarness,
} = require("./fixtures/sequential-start-harness.cjs");

const repoDir = path.resolve(__dirname, "..", "..", "..");
const parallelStartHarnessModulePath = path.join(
	__dirname,
	"..",
	"..",
	"shared",
	"fixtures",
	"parallel-ready-harness.cjs",
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
registerSharedStartPlannerSmokeSuite({
	assert,
	test,
});

test("start() runs a larger ready stage through parallel worker slots when available", async () => {
	const harness = decorateHarness(createParallelStartHarness(), {
		bytes: Buffer.alloc(0),
		createLocalHarness: createParallelStartHarness,
		runInBand: false,
		workerModulePath: parallelStartHarnessModulePath,
	});

	const result = await harness.start();
	const expectedWorkerCount = Math.min(4, availableParallelism());
	const threadIds = result.branches
		.map(
			(branch) =>
				branch.executions[0].events.find((event) => event.type === "diagnostic")
					?.data?.message ?? "",
		)
		.map((message) => Number(message.replace("run-thread-", "")));

	assert.equal(result.discoveryOk, true);
	assert.equal(result.ok, true);
	assert.equal(result.branches.length, 4);
	assert.equal(result.workerCount, expectedWorkerCount);
	if (expectedWorkerCount > 1) {
		assert.equal(new Set(threadIds).size, expectedWorkerCount);
		assert(threadIds.every((threadId) => threadId > 0));
	} else {
		assert.deepEqual(threadIds, [0, 0, 0, 0]);
	}

	harness.close();
});

test("start() preserves empty coverage snapshots when coverage is enabled", async () => {
	const harness = decorateHarness(createParallelStartHarness(), {
		bytes: Buffer.alloc(0),
		createLocalHarness: createParallelStartHarness,
		runInBand: true,
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
		runInBand: true,
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

test("start() executes sequential-scope branches without forcing root barriers", async () => {
	const harness = decorateHarness(createSequentialStartHarness(), {
		bytes: Buffer.alloc(0),
		createLocalHarness: createSequentialStartHarness,
		runInBand: true,
		workerModulePath: sequentialStartHarnessModulePath,
	});

	const result = await harness.start();

	assert.equal(result.discoveryOk, true);
	assert.equal(result.ok, true);
	assert(result.workerCount >= 1);
	assert.deepEqual(
		result.branches.map((branch) =>
			branch.executions.map((execution) => execution.node.name),
		),
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
