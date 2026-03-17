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

const repoDir = path.resolve(__dirname, "..", "..", "..");
const parallelStartHarnessModulePath = path.join(
	__dirname,
	"fixtures",
	"parallel-start-harness.cjs",
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

test("start() runs per-branch discovery in worker threads like wazero", async () => {
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
		assert.match(
			branch.discovery.nodes[1].name,
			/^branch-[ab]-child-thread-[1-9][0-9]*$/,
		);
	}
});
