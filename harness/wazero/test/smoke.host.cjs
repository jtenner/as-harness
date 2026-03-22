const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { availableParallelism, tmpdir } = require("node:os");
const path = require("node:path");
const test = require("node:test");

const addon = require("..");
const { decorateHarness } = require("../../shared/start.cjs");
const {
	compileSmokeFixtures,
	registerHarnessSmokeSuite,
} = require("../../shared/smoke-suite.cjs");
const {
	registerSharedStartPlannerSmokeSuite,
} = require("../../shared/start-planner-smoke.cjs");
const {
	removeTempDirectory,
} = require("../../shared/remove-temp-directory.cjs");
const {
	createHarness: createParallelReadyHarness,
} = require("../../shared/fixtures/parallel-ready-harness.cjs");

const repoDir = path.resolve(__dirname, "..", "..", "..");
const cliEntrypointPath = path.join(repoDir, "cli", "index.ts");

const fixtures = compileSmokeFixtures({
	cacheDir: path.join(repoDir, "harness", "wazero", ".cache"),
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
	runInBand: false,
});

function assertSuccessfulCliRun(result) {
	const diagnostic = [
		`status: ${result.status}`,
		`signal: ${result.signal ?? ""}`,
		`stdout:\n${result.stdout}`,
		`stderr:\n${result.stderr}`,
		result.error ? `error:\n${String(result.error)}` : "",
	]
		.filter(Boolean)
		.join("\n\n");

	assert.equal(result.status, 0, diagnostic);
	assert.equal(result.stderr, "", diagnostic);
}

test("start() runs a larger ready stage through parallel worker slots when available", async () => {
	const decorated = decorateHarness(createParallelReadyHarness(), {
		bytes: Buffer.alloc(0),
		createLocalHarness: createParallelReadyHarness,
		runInBand: false,
		workerModulePath: path.join(
			__dirname,
			"..",
			"..",
			"shared",
			"fixtures",
			"parallel-ready-harness.cjs",
		),
	});
	const result = await decorated.start();
	const expectedWorkerCount = Math.min(4, availableParallelism());
	const threadIds = result.branches.map(
		(branch) =>
			branch.executions[0].events.find((event) => event.type === "diagnostic")
				?.data?.message ?? "",
	);

	assert.equal(result.discoveryOk, true);
	assert.equal(result.ok, true);
	assert.equal(result.branches.length, 4);
	assert.equal(result.workerCount, expectedWorkerCount);
	if (expectedWorkerCount > 1) {
		assert.equal(new Set(threadIds).size, expectedWorkerCount);
		assert(
			threadIds.every(
				(message) => Number(message.replace("run-thread-", "")) > 0,
			),
		);
	}

	decorated.close();
});

test("cli run executes tests through the wazero harness", () => {
	const tempDirectory = mkdtempSync(
		path.join(tmpdir(), "as-harness-wazero-cli-"),
	);

	try {
		const entryFile = path.join(tempDirectory, "suite.test.ts");
		writeFileSync(
			entryFile,
			[
				'import { test, TestContext } from "node:test";',
				"",
				'test("passing test", (_context: TestContext): void => {});',
				"",
			].join("\n"),
			"utf8",
		);

		const result = spawnSync(
			"bun",
			["run", cliEntrypointPath, "run", "--harness", "wazero", entryFile],
			{
				cwd: tempDirectory,
				encoding: "utf8",
			},
		);

		assertSuccessfulCliRun(result);
		assert.match(
			result.stdout,
			/PASS 1 passed, 0 failed, 1 discovered with wazero\./,
		);
	} finally {
		removeTempDirectory(tempDirectory);
	}
});

test("cli run emits coverage through the wazero harness", () => {
	const tempDirectory = mkdtempSync(
		path.join(tmpdir(), "as-harness-wazero-cover-"),
	);

	try {
		const entryFile = path.join(tempDirectory, "suite.test.ts");
		writeFileSync(
			entryFile,
			[
				'import { test, TestContext } from "node:test";',
				"",
				"function branch(value: i32): i32 {",
				"\tif (value > 0) {",
				"\t\treturn value;",
				"\t}",
				"",
				"\treturn -value;",
				"}",
				"",
				'test("coverage test", (context: TestContext): void => {',
				"\tcontext.assert.strictEqual<i32>(branch(5), 5);",
				"});",
				"",
			].join("\n"),
			"utf8",
		);

		const result = spawnSync(
			"bun",
			[
				"run",
				cliEntrypointPath,
				"run",
				"--harness",
				"wazero",
				"--coverage",
				entryFile,
			],
			{
				cwd: tempDirectory,
				encoding: "utf8",
			},
		);

		assertSuccessfulCliRun(result);
		assert.match(result.stdout, /Coverage:/);
		assert.match(result.stdout, /suite\.test\.ts/);
	} finally {
		removeTempDirectory(tempDirectory);
	}
});

test("cli run executes a thin vitest adapter entry through the wazero harness", () => {
	const tempDirectory = mkdtempSync(
		path.join(tmpdir(), "as-harness-wazero-vitest-"),
	);

	try {
		const entryFile = path.join(tempDirectory, "suite.test.ts");
		writeFileSync(
			entryFile,
			[
				'import { describe, it, suite, test, TestContext } from "vitest";',
				"",
				'describe("vitest adapter", (_context): void => {',
				'\ttest.sequential("sequential pass", (_context: TestContext): void => {});',
				'\tit.sequential("sequential it pass", (_context: TestContext): void => {});',
				'\tsuite.sequential("sequential suite alias", (_nestedContext): void => {',
				'\t\ttest("nested suite alias child", (_context: TestContext): void => {});',
				"\t});",
				'\tdescribe.sequential("sequential suite", (_nestedContext): void => {',
				'\t\ttest("nested sequential child", (_context: TestContext): void => {});',
				"\t});",
				'\ttest.skipIf(false)("conditional pass", (_context: TestContext): void => {});',
				'\tit("plain pass", (_context: TestContext): void => {});',
				"});",
				"",
			].join("\n"),
			"utf8",
		);

		const result = spawnSync(
			"bun",
			["run", cliEntrypointPath, "run", "--harness", "wazero", entryFile],
			{
				cwd: tempDirectory,
				encoding: "utf8",
			},
		);

		assertSuccessfulCliRun(result);
		assert.match(
			result.stdout,
			/PASS 6 passed, 0 failed, 6 discovered with wazero\./,
		);
	} finally {
		removeTempDirectory(tempDirectory);
	}
});
