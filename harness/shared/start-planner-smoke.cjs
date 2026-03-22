"use strict";

const path = require("node:path");
const { availableParallelism } = require("node:os");

const { decorateHarness } = require("./start.cjs");
const {
	createHarness: createDependencyStartHarness,
} = require("./fixtures/dependency-start-harness.cjs");
const {
	createHarness: createDependencyOutcomesHarness,
} = require("./fixtures/dependency-outcomes-harness.cjs");
const {
	createHarness: createHintedRunnerHarness,
} = require("./fixtures/hinted-runner-harness.cjs");
const {
	createHarness: createBailStartHarness,
} = require("./fixtures/bail-start-harness.cjs");
const {
	createHarness: createIgnoredHintHarness,
} = require("./fixtures/ignored-hint-harness.cjs");
const {
	createHarness: createInvalidDependencyConstraintHarness,
} = require("./fixtures/invalid-dependency-constraint-harness.cjs");
const {
	createHarness: createInvalidSequenceConstraintHarness,
} = require("./fixtures/invalid-sequence-constraint-harness.cjs");

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
const hintedRunnerHarnessModulePath = path.join(
	__dirname,
	"fixtures",
	"hinted-runner-harness.cjs",
);
const bailStartHarnessModulePath = path.join(
	__dirname,
	"fixtures",
	"bail-start-harness.cjs",
);
const ignoredHintHarnessModulePath = path.join(
	__dirname,
	"fixtures",
	"ignored-hint-harness.cjs",
);
const invalidDependencyConstraintHarnessModulePath = path.join(
	__dirname,
	"fixtures",
	"invalid-dependency-constraint-harness.cjs",
);
const invalidSequenceConstraintHarnessModulePath = path.join(
	__dirname,
	"fixtures",
	"invalid-sequence-constraint-harness.cjs",
);

function registerSharedStartPlannerSmokeSuite(options) {
	const { assert, test, runInBand = false } = options;

	test("start() surfaces missing dependencyNodeIds as blocked planning results", async () => {
		const harness = decorateHarness(createDependencyStartHarness(), {
			bytes: Buffer.alloc(0),
			createLocalHarness: createDependencyStartHarness,
			runInBand,
			workerModulePath: dependencyStartHarnessModulePath,
		});

		const result = await harness.start();
		const expectedWorkerCount = runInBand
			? 1
			: Math.min(2, availableParallelism());

		assert.equal(result.discoveryOk, true);
		assert.equal(result.ok, false);
		assert.equal(result.planningOk, false);
		assert.equal(result.workerCount, expectedWorkerCount);
		assert.deepEqual(result.planIssues, [
			{
				type: "missing-dependency",
				issueLabel: "missing prerequisite",
				targetIdentityKey: "id:2/id:11",
				dependencyIdentityKey: "nodeId:999",
			},
		]);
		assert.deepEqual(
			result.blocked.map((blocked) => ({
				name: blocked.node.name,
				dependencyNodeIds: blocked.node.dependencyNodeIds,
				issueType: blocked.issueType,
				issueLabel: blocked.issueLabel,
				dependencyIdentityKey: blocked.dependencyIdentityKey,
			})),
			[
				{
					name: "blocked missing",
					dependencyNodeIds: [999],
					issueType: "missing-dependency",
					issueLabel: "missing prerequisite",
					dependencyIdentityKey: "nodeId:999",
				},
			],
		);
		assert.deepEqual(
			result.branches.map((branch) =>
				branch.executions.map((execution) => execution.node.name),
			),
			[["prereq"], [], ["plain ready"]],
		);

		harness.close();
	});

	test("start() skips blocked dependents while allowing satisfied expected-failure prerequisites", async () => {
		const harness = decorateHarness(createDependencyOutcomesHarness(), {
			bytes: Buffer.alloc(0),
			createLocalHarness: createDependencyOutcomesHarness,
			runInBand,
			workerModulePath: dependencyOutcomesHarnessModulePath,
		});

		const result = await harness.start();
		const expectedWorkerCount = runInBand
			? 1
			: Math.min(2, availableParallelism());

		assert.equal(result.discoveryOk, true);
		assert.equal(result.ok, false);
		assert.equal(result.planningOk, false);
		assert.equal(result.workerCount, expectedWorkerCount);
		assert.deepEqual(result.planIssues, [
			{
				type: "blocked-dependency",
				issueLabel: "blocked by prerequisite",
				targetIdentityKey: "id:2",
				dependencyIdentityKey: "id:1",
			},
		]);
		assert.deepEqual(
			result.blocked.map((blocked) => ({
				name: blocked.node.name,
				dependencyNodeIds: blocked.node.dependencyNodeIds,
				issueType: blocked.issueType,
				issueLabel: blocked.issueLabel,
				dependencyIdentityKey: blocked.dependencyIdentityKey,
			})),
			[
				{
					name: "blocked by failing prereq",
					dependencyNodeIds: [1],
					issueType: "blocked-dependency",
					issueLabel: "blocked by prerequisite",
					dependencyIdentityKey: "id:1",
				},
			],
		);
		assert.deepEqual(
			result.branches.map((branch) =>
				branch.executions.map((execution) => [
					execution.node.name,
					execution.ok,
				]),
			),
			[
				[["failing prereq", false]],
				[],
				[["expected failure prereq", true]],
				[["depends on expected failure", true]],
			],
		);

		harness.close();
	});

	test("start() keeps in-band hinted work off the worker pool while unrelated work still parallelizes", async () => {
		const harness = decorateHarness(createHintedRunnerHarness(), {
			bytes: Buffer.alloc(0),
			createLocalHarness: createHintedRunnerHarness,
			runInBand,
			workerModulePath: hintedRunnerHarnessModulePath,
		});

		const result = await harness.start();
		const diagnosticsByBranch = new Map(
			result.branches.map((branch) => [
				branch.root.name,
				Number(
					branch.executions[0].events
						.find((event) => event.type === "diagnostic")
						?.data?.message?.replace("run-thread-", "") ?? "",
				),
			]),
		);
		const expectedWorkerCount = runInBand
			? 1
			: availableParallelism() > 1
				? 3
				: 2;

		assert.equal(result.discoveryOk, true);
		assert.equal(result.planningOk, true);
		assert.equal(result.ok, true);
		assert.equal(result.workerCount, expectedWorkerCount);
		assert.equal(diagnosticsByBranch.get("in-band branch"), 0);
		if (!runInBand && availableParallelism() > 1) {
			assert(diagnosticsByBranch.get("worker branch a") > 0);
			assert(diagnosticsByBranch.get("worker branch b") > 0);
			assert.notEqual(
				diagnosticsByBranch.get("worker branch a"),
				diagnosticsByBranch.get("worker branch b"),
			);
		}

		harness.close();
	});

	test("start() treats bail hints as blocked execution policy without flipping planningOk", async () => {
		const harness = decorateHarness(createBailStartHarness(), {
			bytes: Buffer.alloc(0),
			createLocalHarness: createBailStartHarness,
			runInBand,
			workerModulePath: bailStartHarnessModulePath,
		});

		const result = await harness.start();
		const expectedWorkerCount = runInBand
			? 1
			: Math.min(2, availableParallelism());

		assert.equal(result.discoveryOk, true);
		assert.equal(result.planningOk, true);
		assert.equal(result.ok, false);
		assert.equal(result.workerCount, expectedWorkerCount);
		assert.deepEqual(result.planIssues, [
			{
				type: "bailed",
				issueLabel: "stopped after failure",
				targetIdentityKey: "id:1/id:4",
				dependencyIdentityKey: "id:1/id:3",
			},
		]);
		assert.deepEqual(
			result.blocked.map((blocked) => ({
				name: blocked.node.name,
				issueType: blocked.issueType,
				issueLabel: blocked.issueLabel,
				dependencyIdentityKey: blocked.dependencyIdentityKey,
			})),
			[
				{
					name: "bailed sibling",
					issueType: "bailed",
					issueLabel: "stopped after failure",
					dependencyIdentityKey: "id:1/id:3",
				},
			],
		);
		assert.deepEqual(
			result.branches.map((branch) =>
				branch.executions.map((execution) => [
					execution.node.name,
					execution.ok,
				]),
			),
			[[["failing bail child", false]], [["plain ready child", true]]],
		);

		harness.close();
	});

	test("start() surfaces ignored unsupported hints as informational metadata", async () => {
		const harness = decorateHarness(createIgnoredHintHarness(), {
			bytes: Buffer.alloc(0),
			createLocalHarness: createIgnoredHintHarness,
			runInBand,
			workerModulePath: ignoredHintHarnessModulePath,
		});

		const result = await harness.start();
		const expectedWorkerCount = 1;

		assert.equal(result.discoveryOk, true);
		assert.equal(result.planningOk, true);
		assert.equal(result.ok, true);
		assert.equal(result.workerCount, expectedWorkerCount);
		assert.deepEqual(result.planIssues, [
			{
				type: "ignored-hint",
				issueLabel: "ignored hint",
				targetIdentityKey: "id:1",
				dependencyIdentityKey: "",
				hintName: "preferredRunnerMode",
				hintValue: 9,
			},
			{
				type: "ignored-hint",
				issueLabel: "ignored hint",
				targetIdentityKey: "id:1/id:2",
				dependencyIdentityKey: "",
				hintName: "preferredFailurePolicy",
				hintValue: 7,
			},
		]);
		assert.deepEqual(result.blocked, []);
		assert.deepEqual(
			result.branches.map((branch) =>
				branch.executions.map((execution) => [
					execution.node.name,
					execution.ok,
				]),
			),
			[[["ignored hint child", true]]],
		);

		harness.close();
	});

	test("start() treats malformed dependency constraints as planning failures", async () => {
		const harness = decorateHarness(
			createInvalidDependencyConstraintHarness(),
			{
				bytes: Buffer.alloc(0),
				createLocalHarness: createInvalidDependencyConstraintHarness,
				runInBand,
				workerModulePath: invalidDependencyConstraintHarnessModulePath,
			},
		);

		const result = await harness.start();
		const expectedWorkerCount = 1;

		assert.equal(result.discoveryOk, true);
		assert.equal(result.planningOk, false);
		assert.equal(result.ok, false);
		assert.equal(result.workerCount, expectedWorkerCount);
		assert.deepEqual(result.planIssues, [
			{
				type: "invalid-constraint",
				issueLabel: "invalid constraint",
				targetIdentityKey: "id:1/id:2",
				dependencyIdentityKey: "",
			},
		]);
		assert.deepEqual(
			result.blocked.map((blocked) => ({
				name: blocked.node.name,
				issueType: blocked.issueType,
				issueLabel: blocked.issueLabel,
			})),
			[
				{
					name: "invalid dependency target",
					issueType: "invalid-constraint",
					issueLabel: "invalid constraint",
				},
			],
		);
		assert.deepEqual(
			result.branches.map((branch) =>
				branch.executions.map((execution) => execution.node.name),
			),
			[["plain ready child"]],
		);

		harness.close();
	});

	test("start() treats unsupported sequence constraints as planning failures", async () => {
		const harness = decorateHarness(createInvalidSequenceConstraintHarness(), {
			bytes: Buffer.alloc(0),
			createLocalHarness: createInvalidSequenceConstraintHarness,
			runInBand,
			workerModulePath: invalidSequenceConstraintHarnessModulePath,
		});

		const result = await harness.start();
		const expectedWorkerCount = 1;

		assert.equal(result.discoveryOk, true);
		assert.equal(result.planningOk, false);
		assert.equal(result.ok, false);
		assert.equal(result.workerCount, expectedWorkerCount);
		assert.deepEqual(result.planIssues, [
			{
				type: "invalid-constraint",
				issueLabel: "invalid constraint",
				targetIdentityKey: "id:1/id:3",
				dependencyIdentityKey: "",
			},
			{
				type: "invalid-constraint",
				issueLabel: "invalid constraint",
				targetIdentityKey: "id:1/id:4",
				dependencyIdentityKey: "",
			},
		]);
		assert.deepEqual(
			result.blocked.map((blocked) => ({
				name: blocked.node.name,
				issueType: blocked.issueType,
				issueLabel: blocked.issueLabel,
			})),
			[
				{
					name: "blocked child a",
					issueType: "invalid-constraint",
					issueLabel: "invalid constraint",
				},
				{
					name: "blocked child b",
					issueType: "invalid-constraint",
					issueLabel: "invalid constraint",
				},
			],
		);
		assert.deepEqual(
			result.branches.map((branch) =>
				branch.executions.map((execution) => execution.node.name),
			),
			[[], ["plain ready child"]],
		);

		harness.close();
	});
}

module.exports = {
	registerSharedStartPlannerSmokeSuite,
};
