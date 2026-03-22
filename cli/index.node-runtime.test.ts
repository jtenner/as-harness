import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";

const repoDir = join(import.meta.dir, "..");

test("a Node-targeted CLI bundle runs under Node.js", () => {
	const tempDirectory = mkdtempSync(
		join(tmpdir(), "as-harness-node-cli-test-"),
	);

	try {
		const bundledEntrypointPath = join(tempDirectory, "as-harness-cli.mjs");
		const buildResult = spawnSync(
			"bun",
			[
				"build",
				"--target=node",
				`--outfile=${bundledEntrypointPath}`,
				"./cli/index.ts",
			],
			{
				cwd: repoDir,
				encoding: "utf8",
			},
		);

		expect(buildResult.status).toBe(0);
		expect(buildResult.stderr).toBe("");
		const result = spawnSync(
			process.execPath,
			[bundledEntrypointPath, "--version"],
			{
				encoding: "utf8",
			},
		);

		expect(result.status).toBe(0);
		expect(result.stderr).toBe("");
		expect(result.stdout.trim()).toBe("0.2.0");
	} finally {
		rmSync(tempDirectory, { force: true, recursive: true });
	}
});
