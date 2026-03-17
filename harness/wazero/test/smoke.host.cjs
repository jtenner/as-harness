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

test("cli run executes tests through the wazero harness", () => {
	const tempDirectory = mkdtempSync(path.join(tmpdir(), "as-harness-wazero-cli-"));

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

		assert.equal(result.status, 0);
		assert.equal(result.stderr, "");
		assert.match(
			result.stdout,
			/PASS 1 passed, 0 failed, 1 discovered with wazero\./,
		);
	} finally {
		rmSync(tempDirectory, { force: true, recursive: true });
	}
});
