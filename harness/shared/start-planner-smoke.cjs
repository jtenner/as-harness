"use strict";

const path = require("node:path");

const { decorateHarness } = require("./start.cjs");
const {
	createHarness: createDependencyStartHarness,
} = require("./fixtures/dependency-start-harness.cjs");
const {
	createHarness: createDependencyOutcomesHarness,
} = require("./fixtures/dependency-outcomes-harness.cjs");

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

		assert.equal(result.discoveryOk, true);
		assert.equal(result.ok, false);
		assert.equal(result.planningOk, false);
		assert.equal(result.workerCount, 1);
		assert.deepEqual(result.planIssues, [
			{
				type: "missing-dependency",
				targetIdentityKey: "id:2/id:11",
				dependencyIdentityKey: "nodeId:999",
			},
		]);
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

		assert.equal(result.discoveryOk, true);
		assert.equal(result.ok, false);
		assert.equal(result.planningOk, false);
		assert.equal(result.workerCount, 1);
		assert.deepEqual(result.planIssues, [
			{
				type: "blocked-dependency",
				targetIdentityKey: "id:2",
				dependencyIdentityKey: "id:1",
			},
		]);
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
					dependencyNodeIds: [1],
					issueType: "blocked-dependency",
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
}

module.exports = {
	registerSharedStartPlannerSmokeSuite,
};
