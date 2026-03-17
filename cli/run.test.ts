import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { resolveRunEntrypointBaseDirectory } from "./run";

const cliEntrypointPath = join(import.meta.dir, "index.ts");

type CliRunResult = {
	exitCode: number;
	stderr: string;
	stdout: string;
};

async function withTempEntryFile(
	sourceText: string,
	run: (entryFile: string, cwd: string) => Promise<void>,
) {
	const tempDirectory = await mkdtemp(join(tmpdir(), "as-harness-run-"));

	try {
		const entryFile = join(tempDirectory, "suite.test.ts");
		await writeFile(entryFile, sourceText, "utf8");
		await run(entryFile, tempDirectory);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
}

async function runCliWithArguments(
	args: readonly string[],
	cwd: string,
): Promise<CliRunResult> {
	const processHandle = Bun.spawn(["bun", "run", cliEntrypointPath, ...args], {
		cwd,
		stderr: "pipe",
		stdout: "pipe",
	});

	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(processHandle.stdout).text(),
		new Response(processHandle.stderr).text(),
		processHandle.exited,
	]);

	return {
		exitCode,
		stderr,
		stdout,
	};
}

async function runCli(entryFile: string, cwd: string): Promise<CliRunResult> {
	return runCliWithArguments(["run", entryFile], cwd);
}

test("resolveRunEntrypointBaseDirectory keeps Windows temp wrappers on the entry drive", () => {
	expect(
		resolveRunEntrypointBaseDirectory(
			["C:\\Users\\runner\\AppData\\Local\\Temp\\suite.test.ts"],
			"D:\\a\\as-harness",
			"win32",
		),
	).toBe("C:\\Users\\runner\\AppData\\Local\\Temp");
});

test("resolveRunEntrypointBaseDirectory rejects mixed Windows drive entry sets", () => {
	expect(() =>
		resolveRunEntrypointBaseDirectory(
			[
				"C:\\Users\\runner\\AppData\\Local\\Temp\\suite-a.test.ts",
				"D:\\a\\as-harness\\suite-b.test.ts",
			],
			"D:\\a\\as-harness",
			"win32",
		),
	).toThrow(
		"as-harness run does not support entry files on multiple Windows drives.",
	);
});

test("cli run executes passing and failing node:test entry files through the js host", async () => {
	await withTempEntryFile(
		`
import { test, TestContext } from "node:test";

test("passing test", (_context: TestContext): void => {});
`,
		async (entryFile, cwd) => {
			const result = await runCliWithArguments(
				["run", "--harness", "js", entryFile],
				cwd,
			);

			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
			expect(result.stdout).toContain(
				"PASS 1 test(s) across 1 top-level node(s) with js.",
			);
		},
	);

	await withTempEntryFile(
		`
import { test, TestContext } from "node:test";

test("failing test", (context: TestContext): void => {
  context.assert.strictEqual<i32>(11, 12, "shape mismatch");
});
`,
		async (entryFile, cwd) => {
			const result = await runCli(entryFile, cwd);

			expect(result.exitCode).toBe(1);
			expect(result.stdout).toBe("");
			expect(result.stderr).toContain(
				"FAIL 1 test(s) failed out of 1 discovered with js.",
			);
			expect(result.stderr).toContain("- failing test: shape mismatch");
		},
	);

	await withTempEntryFile(
		`
import { test, TestContext } from "node:test";

test("passing test", (_context: TestContext): void => {});
`,
		async (entryFile, cwd) => {
			const result = await runCliWithArguments(
				["run", "--harness", "nope", entryFile],
				cwd,
			);

			expect(result.exitCode).toBe(3);
			expect(result.stdout).toBe("");
			expect(result.stderr).toContain(
				"Harness resolution failed: Unsupported harness: nope. Supported harnesses: js, wazero, wasmtime.",
			);
		},
	);
});
