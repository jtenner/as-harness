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
				"PASS 1 passed, 0 failed, 1 discovered with js.",
			);
		},
	);

	await withTempEntryFile(
		`
import { test, TestContext } from "node:test";

test("passing test", (context: TestContext): void => {
  context.diagnostic("passing diagnostic");
  trace("passing trace", 1, 1);
});

test("failing test", (context: TestContext): void => {
  context.diagnostic("failing diagnostic");
  trace("failing trace", 2, 12, 13);
  context.assert.strictEqual<i32>(11, 12, "shape mismatch");
});
`,
		async (entryFile, cwd) => {
			const result = await runCli(entryFile, cwd);

			expect(result.exitCode).toBe(1);
			expect(result.stdout).toBe("");
			expect(result.stderr).toContain(
				"FAIL 1 passed, 1 failed, 2 discovered with js.",
			);
			expect(result.stderr).toContain("- failing test");
			expect(result.stderr).toContain("  fail: shape mismatch");
			expect(result.stderr).toContain("  diagnostic: failing diagnostic");
			expect(result.stderr).toContain("  trace: failing trace (12, 13)");
			expect(result.stderr).not.toContain("passing diagnostic");
			expect(result.stderr).not.toContain("passing trace");
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

test("cli run executes a thin jest adapter entry when --lib jest is provided", async () => {
	await withTempEntryFile(
		`
import {
  beforeEach,
  describe,
  expect,
  test,
  TestContext,
  xdescribe,
  xit,
  xtest,
} from "jest";

let beforeEachCount = 0;

function throwsUnreachable(): void {
  unreachable();
}

function shouldNeverExecuteSkipAlias(): void {
  unreachable();
}

const strictArrayNeedle = [2, 3];
const strictSetNeedle = [5, 6];
const strictMapKey = [7, 8];

const arrayLikeValues = new Uint8Array(3);
arrayLikeValues[0] = 9;
arrayLikeValues[1] = 10;
arrayLikeValues[2] = 11;

const strictArrayHaystack = [strictArrayNeedle, [4, 5]];

const strictSetHaystack = new Set<Array<i32>>();
strictSetHaystack.add(strictSetNeedle);

const strictMapHaystack = new Map<Array<i32>, string>();
strictMapHaystack.set(strictMapKey, "mapped");

beforeEach((_context: TestContext): void => {
  beforeEachCount += 1;
});

describe("jest adapter", (_context): void => {
  xdescribe("xdescribe branch", (_nestedContext): void => {
    shouldNeverExecuteSkipAlias();
  });

  xtest("xtest leaf", (_context: TestContext): void => {
    shouldNeverExecuteSkipAlias();
  });

  xit("xit leaf", (_context: TestContext): void => {
    shouldNeverExecuteSkipAlias();
  });

  test("passes through jest adapter", (context: TestContext): void => {
    expect<i32>(beforeEachCount).toBe(1);
    expect<i32>(beforeEachCount).not.toBe(2);
    expect<Array<i32>>([1, 2]).toEqual([1, 2]);
    expect<Array<i32>>([1, 2]).not.toEqual([1, 3]);
    expect<Array<Array<i32>>>(strictArrayHaystack).toContain(strictArrayNeedle);
    expect<Array<Array<i32>>>(strictArrayHaystack).toContainEqual([2, 3]);
    expect<Array<Array<i32>>>(strictArrayHaystack).not.toContainEqual([8, 9]);
    expect<Uint8Array>(arrayLikeValues).toContain(<u8>10);
    expect<Uint8Array>(arrayLikeValues).not.toContain(<u8>12);
    expect<Set<Array<i32>>>(strictSetHaystack).toContain(strictSetNeedle);
    expect<Set<Array<i32>>>(strictSetHaystack).toContainEqual([5, 6]);
    expect<Map<Array<i32>, string>>(strictMapHaystack).toContain(strictMapKey);
    expect<Map<Array<i32>, string>>(strictMapHaystack).toContainEqual([7, 8]);
    expect<Array<i32>>([1, 2, 3]).toHaveLength(3);
    expect<Uint8Array>(arrayLikeValues).toHaveLength(3);
    expect<Set<Array<i32>>>(strictSetHaystack).toHaveLength(1);
    expect<Map<Array<i32>, string>>(strictMapHaystack).toHaveLength(1);
    expect<i32>(5).toBeGreaterThan(4);
    expect<i32>(4).not.toBeGreaterThan(5);
    expect<i32>(4).toBeLessThan(5);
    expect<i32>(5).not.toBeLessThan(4);
    expect<f64>(NaN).toBeNaN();
    expect<f64>(1.25).not.toBeNaN();
    expect<() => void>(throwsUnreachable).toThrow();
    expect<() => void>(((): void => {})).not.toThrow();
    context.diagnostic("jest adapter diagnostic");
  });
});
`,
		async (entryFile, cwd) => {
			const result = await runCliWithArguments(
				["run", "--harness", "js", "--lib", "jest", entryFile],
				cwd,
			);

			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
			expect(result.stdout).toContain(
				"PASS 1 passed, 0 failed, 3 discovered with js.",
			);
		},
	);
});
