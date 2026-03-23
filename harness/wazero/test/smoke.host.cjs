const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const {
	mkdtempSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} = require("node:fs");
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
	resolveSourceCliBundlePath,
} = require("../../shared/source-cli-bundle.cjs");
const {
	createHarness: createParallelReadyHarness,
} = require("../../shared/fixtures/parallel-ready-harness.cjs");

const repoDir = path.resolve(__dirname, "..", "..", "..");
const cliEntrypointPath = resolveSourceCliBundlePath(repoDir);

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

function createCliEnvironment() {
	return {
		...process.env,
		AS_HARNESS_SOURCE_CLI_REPO_DIR: repoDir,
	};
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
			process.execPath,
			[cliEntrypointPath, "run", "--harness", "wazero", entryFile],
			{
				cwd: tempDirectory,
				encoding: "utf8",
				env: createCliEnvironment(),
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
			process.execPath,
			[
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
				env: createCliEnvironment(),
			},
		);

		assertSuccessfulCliRun(result);
		assert.match(result.stdout, /Coverage:/);
		assert.match(result.stdout, /suite\.test\.ts/);
	} finally {
		removeTempDirectory(tempDirectory);
	}
});

test("cli run executes uvu fixture and snapshot helpers through the wazero harness", () => {
	const tempDirectory = mkdtempSync(
		path.join(tmpdir(), "as-harness-wazero-snapshots-"),
	);

	try {
		const entryFile = path.join(tempDirectory, "suite.test.ts");
		writeFileSync(
			entryFile,
			[
				'import { test } from "uvu";',
				'import { fixture, snapshot } from "uvu/assert";',
				"",
				'test("snapshot smoke", (): void => {',
				'\tsnapshot<string>(fixture("cases/alpha.txt"), "snapshot smoke");',
				"});",
				"",
			].join("\n"),
			"utf8",
		);
		mkdirSync(path.join(tempDirectory, "__fixtures__", "cases"), {
			recursive: true,
		});
		mkdirSync(path.join(tempDirectory, "__snapshots__"), { recursive: true });
		writeFileSync(
			path.join(tempDirectory, "__fixtures__", "cases", "alpha.txt"),
			"fixture text\n",
			"utf8",
		);
		writeFileSync(
			path.join(tempDirectory, "__snapshots__", "suite.test.snap"),
			'exports[`snapshot smoke~(0)`] = `"fixture text\\n"`;\n',
			"utf8",
		);

		const result = spawnSync(
			process.execPath,
			[cliEntrypointPath, "run", "--harness", "wazero", entryFile],
			{
				cwd: tempDirectory,
				encoding: "utf8",
				env: createCliEnvironment(),
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

test("cli run reports mismatched and stale snapshots through the wazero harness", () => {
	const tempDirectory = mkdtempSync(
		path.join(tmpdir(), "as-harness-wazero-snapshot-mismatch-"),
	);

	try {
		const entryFile = path.join(tempDirectory, "suite.test.ts");
		writeFileSync(
			entryFile,
			[
				'import { test } from "uvu";',
				'import { snapshot } from "uvu/assert";',
				"",
				'test("snapshot smoke", (): void => {',
				'\tsnapshot<string>("new value", "snapshot smoke");',
				"});",
				"",
			].join("\n"),
			"utf8",
		);
		mkdirSync(path.join(tempDirectory, "__snapshots__"), { recursive: true });
		writeFileSync(
			path.join(tempDirectory, "__snapshots__", "suite.test.snap"),
			[
				'exports[`snapshot smoke~(0)`] = `"old value"`;',
				"",
				'exports[`snapshot smoke~(1)`] = `"stale value"`;',
				"",
			].join("\n"),
			"utf8",
		);

		const result = spawnSync(
			process.execPath,
			[cliEntrypointPath, "run", "--harness", "wazero", entryFile],
			{
				cwd: tempDirectory,
				encoding: "utf8",
				env: createCliEnvironment(),
			},
		);

		assert.equal(result.status, 1);
		assert.match(result.stderr, /snapshot mismatch:/);
		assert.match(result.stderr, /stale snapshot entry:/);
	} finally {
		removeTempDirectory(tempDirectory);
	}
});

test("cli run rewrites snapshots in update mode through the wazero harness", () => {
	const tempDirectory = mkdtempSync(
		path.join(tmpdir(), "as-harness-wazero-snapshot-update-"),
	);

	try {
		const entryFile = path.join(tempDirectory, "suite.test.ts");
		writeFileSync(
			entryFile,
			[
				'import { test } from "uvu";',
				'import { fixture, snapshot } from "uvu/assert";',
				"",
				'test("snapshot smoke", (): void => {',
				'\tsnapshot<string>(fixture("cases/alpha.txt"), "snapshot smoke");',
				"});",
				"",
			].join("\n"),
			"utf8",
		);
		mkdirSync(path.join(tempDirectory, "__fixtures__", "cases"), {
			recursive: true,
		});
		mkdirSync(path.join(tempDirectory, "__snapshots__"), { recursive: true });
		writeFileSync(
			path.join(tempDirectory, "__fixtures__", "cases", "alpha.txt"),
			"updated fixture\n",
			"utf8",
		);
		writeFileSync(
			path.join(tempDirectory, "__snapshots__", "suite.test.snap"),
			[
				'exports[`snapshot smoke~(0)`] = `"outdated fixture\\n"`;',
				"",
				'exports[`snapshot smoke~(1)`] = `"stale fixture\\n"`;',
				"",
			].join("\n"),
			"utf8",
		);

		const result = spawnSync(
			process.execPath,
			[
				cliEntrypointPath,
				"run",
				"--harness",
				"wazero",
				"--update-snapshots",
				entryFile,
			],
			{
				cwd: tempDirectory,
				encoding: "utf8",
				env: createCliEnvironment(),
			},
		);

		assertSuccessfulCliRun(result);
		assert.match(
			readFileSync(
				path.join(tempDirectory, "__snapshots__", "suite.test.snap"),
				"utf8",
			),
			/exports\[`snapshot smoke~\(0\)`\] = `"updated fixture/,
		);
		assert.doesNotMatch(
			readFileSync(
				path.join(tempDirectory, "__snapshots__", "suite.test.snap"),
				"utf8",
			),
			/stale fixture/,
		);
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
			process.execPath,
			[cliEntrypointPath, "run", "--harness", "wazero", entryFile],
			{
				cwd: tempDirectory,
				encoding: "utf8",
				env: createCliEnvironment(),
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

test("cli run executes a thin mocha adapter entry through the wazero harness", () => {
	const tempDirectory = mkdtempSync(
		path.join(tmpdir(), "as-harness-wazero-mocha-"),
	);

	try {
		const entryFile = path.join(tempDirectory, "suite.test.ts");
		writeFileSync(
			entryFile,
			[
				'import { context, describe, it, specify, TestContext, xit } from "mocha";',
				"",
				'describe("mocha adapter", (_context): void => {',
				'\txit("skipped leaf", (_context: TestContext): void => {});',
				'\tcontext("context alias", (_nestedContext): void => {',
				'\t\tit("nested context child", (_context: TestContext): void => {});',
				"\t});",
				'\tit("plain pass", (_context: TestContext): void => {});',
				'\tspecify("asserted pass", (context: TestContext): void => {',
				'\t\tcontext.assert.strictEqual<i32>(11, 11, "mocha host mismatch");',
				"\t});",
				"});",
				"",
			].join("\n"),
			"utf8",
		);

		const result = spawnSync(
			process.execPath,
			[cliEntrypointPath, "run", "--harness", "wazero", entryFile],
			{
				cwd: tempDirectory,
				encoding: "utf8",
				env: createCliEnvironment(),
			},
		);

		assertSuccessfulCliRun(result);
		assert.match(
			result.stdout,
			/PASS 3 passed, 0 failed, 4 discovered with wazero\./,
		);
	} finally {
		removeTempDirectory(tempDirectory);
	}
});

test("cli run executes a thin jasmine adapter entry through the wazero harness", () => {
	const tempDirectory = mkdtempSync(
		path.join(tmpdir(), "as-harness-wazero-jasmine-"),
	);

	try {
		const entryFile = path.join(tempDirectory, "suite.test.ts");
		writeFileSync(
			entryFile,
			[
				'import { describe, expect, fail, it, TestContext, xit } from "jasmine";',
				"",
				"function failImmediately(): void {",
				'\tfail("jasmine fail trap");',
				"}",
				"",
				'describe("jasmine adapter", (_context): void => {',
				'\txit("skipped leaf", (_context: TestContext): void => {});',
				'\tit("implicit pending");',
				'\tit("plain pass", (_context: TestContext): void => {});',
				'\tit("matcher pass", (context: TestContext): void => {',
				"\t\texpect<i32>(5).toBeGreaterThan(4);",
				"\t\texpect<() => void>(failImmediately).toThrow();",
				'\t\tcontext.diagnostic("jasmine host diagnostic");',
				"\t});",
				"});",
				"",
			].join("\n"),
			"utf8",
		);

		const result = spawnSync(
			process.execPath,
			[cliEntrypointPath, "run", "--harness", "wazero", entryFile],
			{
				cwd: tempDirectory,
				encoding: "utf8",
				env: createCliEnvironment(),
			},
		);

		assertSuccessfulCliRun(result);
		assert.match(
			result.stdout,
			/PASS 2 passed, 0 failed, 4 discovered with wazero\./,
		);
	} finally {
		removeTempDirectory(tempDirectory);
	}
});

test('cli run executes the bundled "uvu/assert" guest library through the wazero harness', () => {
	const tempDirectory = mkdtempSync(
		path.join(tmpdir(), "as-harness-wazero-uvu-assert-"),
	);

	try {
		const entryFile = path.join(tempDirectory, "suite.test.ts");
		writeFileSync(
			entryFile,
			[
				'import { test, TestContext } from "node:test";',
				'import { equal, is, not, ok, throws, type, unreachable } from "uvu/assert";',
				"",
				"function failViaUnreachable(): void {",
				'\tunreachable("uvu assert trap");',
				"}",
				"",
				"function doesNotTrap(): void {}",
				"",
				'test("passes through uvu/assert", (context: TestContext): void => {',
				"\tok<bool>(true);",
				"\tis<i32>(11, 11);",
				"\tis.not<i32>(11, 12);",
				"\tequal<Array<i32>>([1, 2], [1, 2]);",
				'\ttype<i32>(11, "number");',
				'\ttype<string>("uvu", "string");',
				"\tthrows(failViaUnreachable);",
				"\tnot<i32>(11, 12);",
				"\tnot.equal<Array<i32>>([1, 2], [1, 3]);",
				'\tnot.type<i32>(11, "string");',
				"\tnot.throws(doesNotTrap);",
				'\tcontext.diagnostic("uvu assert host diagnostic");',
				"});",
				"",
			].join("\n"),
			"utf8",
		);

		const result = spawnSync(
			process.execPath,
			[cliEntrypointPath, "run", "--harness", "wazero", entryFile],
			{
				cwd: tempDirectory,
				encoding: "utf8",
				env: createCliEnvironment(),
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

test('cli run executes the bundled "uvu" guest library through the wazero harness', () => {
	const tempDirectory = mkdtempSync(
		path.join(tmpdir(), "as-harness-wazero-uvu-"),
	);

	try {
		const entryFile = path.join(tempDirectory, "suite.test.ts");
		writeFileSync(
			entryFile,
			[
				'import { equal, is, not, ok, unreachable } from "uvu/assert";',
				'import { exec, suite, test, TestContext } from "uvu";',
				"",
				"let rootBeforeEachCount = 0;",
				"let rootAfterEachCount = 0;",
				"let suiteBeforeCount = 0;",
				"let suiteBeforeEachCount = 0;",
				"let suiteAfterEachCount = 0;",
				"let suiteAfterCount = 0;",
				"",
				"function trapViaUnreachable(): void {",
				'\tunreachable("uvu host trap");',
				"}",
				"",
				"test.before((_context: TestContext): void => {});",
				"test.before.each((_context: TestContext): void => {",
				"\trootBeforeEachCount += 1;",
				"});",
				"test.after.each((_context: TestContext): void => {",
				"\trootAfterEachCount += 1;",
				"});",
				"test.after((_context: TestContext): void => {});",
				"test.inBand();",
				"test.inBand(false);",
				"test.bail();",
				"test.continueOnFailure();",
				"exec(false);",
				"",
				'const adapterSuite = suite("uvu adapter");',
				"adapterSuite.inBand();",
				"adapterSuite.bail();",
				"adapterSuite.continueOnFailure();",
				"adapterSuite.before((_context: TestContext): void => {",
				"\tsuiteBeforeCount += 1;",
				"});",
				"adapterSuite.beforeEach((_context: TestContext): void => {",
				"\tsuiteBeforeEachCount += 1;",
				"});",
				"adapterSuite.afterEach((_context: TestContext): void => {",
				"\tsuiteAfterEachCount += 1;",
				"});",
				"adapterSuite.after((_context: TestContext): void => {",
				"\tsuiteAfterCount = suiteBeforeEachCount;",
				"});",
				'adapterSuite.skip("skipped child", (_context: TestContext): void => {',
				"\ttrapViaUnreachable();",
				"});",
				'adapterSuite.only("focused child", (context: TestContext): void => {',
				'\tcontext.assert.strictEqual<bool>(rootBeforeEachCount > 0, true, "root beforeEach missing");',
				'\tcontext.assert.strictEqual<i32>(rootAfterEachCount + 1, rootBeforeEachCount, "root afterEach ordering mismatch");',
				'\tcontext.assert.strictEqual<i32>(suiteBeforeCount, 1, "suite before mismatch");',
				'\tcontext.assert.strictEqual<bool>(suiteBeforeEachCount > 0, true, "suite beforeEach missing");',
				'\tcontext.assert.strictEqual<i32>(suiteAfterEachCount + 1, suiteBeforeEachCount, "suite afterEach ordering mismatch");',
				'\tcontext.assert.strictEqual<i32>(suiteAfterCount, 0, "suite after ran too early");',
				"\tok<bool>(true);",
				"\tis<i32>(21, 21);",
				"\tis.not<i32>(21, 22);",
				"\tequal<Array<i32>>([1, 2], [1, 2]);",
				"\tnot<i32>(21, 22);",
				"\tnot.equal<Array<i32>>([1, 2], [1, 3]);",
				"\tcontext.assert.throws(trapViaUnreachable);",
				'\tcontext.diagnostic("uvu host diagnostic");',
				"});",
				"adapterSuite.run();",
				"exec(false);",
				"",
			].join("\n"),
			"utf8",
		);

		const result = spawnSync(
			process.execPath,
			[cliEntrypointPath, "run", "--harness", "wazero", entryFile],
			{
				cwd: tempDirectory,
				encoding: "utf8",
				env: createCliEnvironment(),
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
