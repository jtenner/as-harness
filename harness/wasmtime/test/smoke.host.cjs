const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const test = require("node:test");

const addon = require("..");
const {
	compileSmokeFixtures,
	registerHarnessSmokeSuite,
} = require("../../shared/smoke-suite.cjs");
const {
	registerSharedStartPlannerSmokeSuite,
} = require("../../shared/start-planner-smoke.cjs");

const repoDir = path.resolve(__dirname, "..", "..", "..");
const cliEntrypointPath = path.join(repoDir, "cli", "index.ts");

const fixtures = compileSmokeFixtures({
	cacheDir: path.join(repoDir, "harness", "wasmtime", ".cache"),
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

test("cli run executes tests through the wasmtime harness", () => {
	const tempDirectory = mkdtempSync(path.join(tmpdir(), "as-harness-wasmtime-cli-"));

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
			["run", cliEntrypointPath, "run", "--harness", "wasmtime", entryFile],
			{
				cwd: tempDirectory,
				encoding: "utf8",
			},
		);

		assert.equal(result.status, 0);
		assert.equal(result.stderr, "");
		assert.match(
			result.stdout,
			/PASS 1 passed, 0 failed, 1 discovered with wasmtime\./,
		);
	} finally {
		rmSync(tempDirectory, { force: true, recursive: true });
	}
});

test("cli run emits coverage through the wasmtime harness", () => {
	const tempDirectory = mkdtempSync(path.join(tmpdir(), "as-harness-wasmtime-cover-"));

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
				"wasmtime",
				"--coverage",
				entryFile,
			],
			{
				cwd: tempDirectory,
				encoding: "utf8",
			},
		);

		assert.equal(result.status, 0);
		assert.equal(result.stderr, "");
		assert.match(result.stdout, /Coverage:/);
		assert.match(result.stdout, /suite\.test\.ts/);
	} finally {
		rmSync(tempDirectory, { force: true, recursive: true });
	}
});
