const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const addon = require("..");
const { decorateHarness } = require("../../shared/start.cjs");
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
const {
	createHarness: createDependencyStartHarness,
} = require("./fixtures/dependency-start-harness.cjs");
const {
	createHarness: createDependencyOutcomesHarness,
} = require("./fixtures/dependency-outcomes-harness.cjs");

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
const dependencyStartHarnessModulePath = path.join(
	__dirname,
	"fixtures",
	"dependency-start-harness.cjs",
);
const dependencyOutcomesHarnessModulePath = path.join(
	__dirname,
	"fixtures",
	"dependency-outcomes-harness.cjs",
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

test("start() runs graph execution through a single worker thread like wazero", async () => {
	const harness = decorateHarness(createParallelStartHarness(), {
		bytes: Buffer.alloc(0),
		createLocalHarness: createParallelStartHarness,
		workerModulePath: parallelStartHarnessModulePath,
	});

	const result = await harness.start();

	assert.equal(result.discoveryOk, true);
	assert.equal(result.ok, true);
	assert.equal(result.branches.length, 2);
	assert.equal(result.workerCount, 1);
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

test("start() executes sequential-scope branches without forcing root barriers", async () => {
	const harness = decorateHarness(createSequentialStartHarness(), {
		bytes: Buffer.alloc(0),
		createLocalHarness: createSequentialStartHarness,
		workerModulePath: sequentialStartHarnessModulePath,
	});

	const result = await harness.start();

	assert.equal(result.discoveryOk, true);
	assert.equal(result.ok, true);
	assert.equal(result.workerCount, 1);
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

test("start() surfaces missing dependencyNodeIds as blocked planning results", async () => {
	const harness = decorateHarness(createDependencyStartHarness(), {
		bytes: Buffer.alloc(0),
		createLocalHarness: createDependencyStartHarness,
		workerModulePath: dependencyStartHarnessModulePath,
	});

	const result = await harness.start();

	assert.equal(result.discoveryOk, true);
	assert.equal(result.ok, false);
	assert.equal(result.planningOk, false);
	assert.equal(result.workerCount, 1);
	assert.deepEqual(
		result.planIssues,
		[
			{
				type: "missing-dependency",
				targetIdentityKey: "id:2/id:11",
				dependencyIdentityKey: "nodeId:999",
			},
		],
	);
	assert.deepEqual(
		result.blocked.map((blocked) => ({
			name: blocked.node.name,
			dependencyNodeIds: blocked.node.dependencyNodeIds,
			issueType: blocked.issueType,
			dependencyIdentityKey: blocked.dependencyIdentityKey,
		})),
		[
			{
				name: "blocked missing",
				dependencyNodeIds: [999],
				issueType: "missing-dependency",
				dependencyIdentityKey: "nodeId:999",
			},
		],
	);
	assert.deepEqual(
		result.branches.map((branch) => branch.executions.map((execution) => execution.node.name)),
		[["prereq"], [], ["plain ready"]],
	);

	harness.close();
});

test("start() skips blocked dependents while allowing satisfied expected-failure prerequisites", async () => {
	const harness = decorateHarness(createDependencyOutcomesHarness(), {
		bytes: Buffer.alloc(0),
		createLocalHarness: createDependencyOutcomesHarness,
		workerModulePath: dependencyOutcomesHarnessModulePath,
	});

	const result = await harness.start();

	assert.equal(result.discoveryOk, true);
	assert.equal(result.ok, false);
	assert.equal(result.planningOk, false);
	assert.equal(result.workerCount, 1);
	assert.deepEqual(
		result.planIssues,
		[
			{
				type: "blocked-dependency",
				targetIdentityKey: "id:2/id:11",
				dependencyIdentityKey: "id:1/id:10",
			},
		],
	);
	assert.deepEqual(
		result.blocked.map((blocked) => ({
			name: blocked.node.name,
			dependencyNodeIds: blocked.node.dependencyNodeIds,
			issueType: blocked.issueType,
			dependencyIdentityKey: blocked.dependencyIdentityKey,
		})),
		[
			{
				name: "blocked by failing prereq",
				dependencyNodeIds: [10],
				issueType: "blocked-dependency",
				dependencyIdentityKey: "id:1/id:10",
			},
		],
	);
	assert.deepEqual(
		result.branches.map((branch) =>
			branch.executions.map((execution) => [execution.node.name, execution.ok]),
		),
		[
			[["failing prereq", false]],
			[],
			[["expected failure prereq", false]],
			[["depends on expected failure", true]],
		],
	);

	harness.close();
});
