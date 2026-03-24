import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "bun:test";

const repoDir = join(import.meta.dir, "..");
const jsHarnessModulePath = join(repoDir, "harness", "js", "index.cjs");
const customHarnessFixturesDirectory = join(
	import.meta.dir,
	"test",
	"fixtures",
	"custom-harnesses",
);
const customHarnessPathFixturePath = join(
	customHarnessFixturesDirectory,
	"custom-path-runtime.mjs",
);
const customHarnessTypeScriptFixturePath = join(
	customHarnessFixturesDirectory,
	"custom-ts-runtime.ts",
);
const cliVersion = JSON.parse(
	readFileSync(join(import.meta.dir, "package.json"), "utf8"),
) as {
	version: string;
};

function buildNodeTargetedCliBundle(tempDirectory: string) {
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
	return bundledEntrypointPath;
}

function runNodeTargetedCli(
	bundledEntrypointPath: string,
	args: readonly string[],
	cwd: string,
) {
	return spawnSync("node", [bundledEntrypointPath, ...args], {
		cwd,
		encoding: "utf8",
		env: {
			...process.env,
			AS_HARNESS_SOURCE_CLI_REPO_DIR: repoDir,
		},
	});
}

function renderCustomHarnessFixture(sourceText: string) {
	return sourceText.replaceAll(
		"__JS_HARNESS_MODULE_PATH__",
		JSON.stringify(jsHarnessModulePath),
	);
}

function materializeCustomHarnessFixture(
	sourceFixturePath: string,
	destinationPath: string,
) {
	mkdirSync(dirname(destinationPath), { recursive: true });
	const sourceText = readFileSync(sourceFixturePath, "utf8");
	writeFileSync(
		destinationPath,
		renderCustomHarnessFixture(sourceText),
		"utf8",
	);
}

test("a Node-targeted CLI bundle runs under Node.js", () => {
	const tempDirectory = mkdtempSync(
		join(tmpdir(), "as-harness-node-cli-test-"),
	);

	try {
		const bundledEntrypointPath = buildNodeTargetedCliBundle(tempDirectory);
		const result = runNodeTargetedCli(
			bundledEntrypointPath,
			["--version"],
			tempDirectory,
		);

		expect(result.status).toBe(0);
		expect(result.stderr).toBe("");
		expect(result.stdout.trim()).toBe(cliVersion.version);
	} finally {
		rmSync(tempDirectory, { force: true, recursive: true });
	}
});

test(
	"a Node-targeted CLI bundle loads custom .mjs harness files and rejects custom .ts harness files with the Bun-only diagnostic",
	() => {
		const tempDirectory = mkdtempSync(
			join(tmpdir(), "as-harness-node-cli-custom-runtime-"),
		);

		try {
			const bundledEntrypointPath = buildNodeTargetedCliBundle(tempDirectory);
			const entryFile = join(tempDirectory, "suite.test.ts");
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
			materializeCustomHarnessFixture(
				customHarnessPathFixturePath,
				join(tempDirectory, "tools", "fixture-path-runtime.mjs"),
			);
			materializeCustomHarnessFixture(
				customHarnessTypeScriptFixturePath,
				join(tempDirectory, "tools", "fixture-ts-runtime.ts"),
			);

			const pathHarnessResult = runNodeTargetedCli(
				bundledEntrypointPath,
				["run", "--harness", "./tools/fixture-path-runtime.mjs", entryFile],
				tempDirectory,
			);
			expect(pathHarnessResult.status).toBe(0);
			expect(pathHarnessResult.stderr).toBe("");
			expect(pathHarnessResult.stdout).toContain(
				"PASS 1 passed, 0 failed, 1 discovered with fixture-path-js.",
			);

			const typeScriptHarnessResult = runNodeTargetedCli(
				bundledEntrypointPath,
				["run", "--harness", "./tools/fixture-ts-runtime.ts", entryFile],
				tempDirectory,
			);
			expect(typeScriptHarnessResult.status).toBe(3);
			expect(typeScriptHarnessResult.stdout).toBe("");
			expect(typeScriptHarnessResult.stderr).toContain(
				"Harness resolution failed: Custom TypeScript harness files require Bun: ./tools/fixture-ts-runtime.ts",
			);
			expect(typeScriptHarnessResult.stderr).not.toContain(
				"ERR_UNKNOWN_FILE_EXTENSION",
			);
			expect(typeScriptHarnessResult.stderr).not.toContain(
				"Unknown file extension",
			);
		} finally {
			rmSync(tempDirectory, { force: true, recursive: true });
		}
	},
	{ timeout: 15_000 },
);
