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
}

module.exports = {
	registerSharedStartPlannerSmokeSuite,
};
