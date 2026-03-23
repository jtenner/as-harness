import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { compileEntrypoints } from "./as/compile";
import type {
	Harness,
	HarnessCreateOptions,
	HarnessStartResult,
} from "../harness/shared/harness-types";
import { jsRuntime } from "./runtime/js";
import {
	resolveRunEntrypointBaseDirectory,
	runEntryFiles,
	RunExitCode,
} from "./run";
import type { Runtime } from "./runtime/types";

const cliEntrypointPath = join(import.meta.dir, "index.ts");
const wazeroAddonPath = join(
	import.meta.dir,
	"..",
	"harness",
	"wazero",
	"dist",
	"wazero.node",
);
const wasmtimeAddonPath = join(
	import.meta.dir,
	"..",
	"harness",
	"wasmtime",
	"dist",
	"wasmtime.node",
);

type CliRunResult = {
	exitCode: number;
	stderr: string;
	stdout: string;
};

const dependencyCliHarnesses = [
	"js",
	...(existsSync(wazeroAddonPath) ? ["wazero"] : []),
	...(existsSync(wasmtimeAddonPath) ? ["wasmtime"] : []),
] as const;
const dependencyCliHarnessTimeout = { timeout: 60_000 } as const;
const bundledGuestLibraryCliHarnessTimeout = { timeout: 120_000 } as const;

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

function createPassingStartResult(): HarnessStartResult {
	return {
		metadata: {
			ok: true,
			discoveryOk: true,
			planningOk: true,
			discoveredTestCount: 1,
			topLevelNodes: [],
			workerCount: 0,
			planIssues: [],
			blocked: [],
			coverage: null,
		},
		ok: true,
		discoveryOk: true,
		planningOk: true,
		discoveredTestCount: 1,
		topLevelNodes: [],
		workerCount: 0,
		branches: [],
		planIssues: [],
		blocked: [],
		coverage: null,
	};
}

function createCapturingHarness(): Harness {
	return {
		onNodeFound() {},
		onNodeStart() {},
		onNodePass() {},
		onNodeFail() {},
		onFailMessage() {},
		onCallbackStart() {},
		onCallbackPass() {},
		onCallbackFail() {},
		onDiagnostic() {},
		onLog() {},
		callI32() {
			return 0;
		},
		discover() {
			return false;
		},
		run() {
			return false;
		},
		async start() {
			return createPassingStartResult();
		},
		getCoverageSnapshot() {
			return null;
		},
		resetCoverage() {},
		close() {},
	};
}

function parseCoverageJSONFromStdout(stdout: string) {
	const jsonStart = stdout.indexOf("{");
	if (jsonStart === -1) {
		throw new Error(`Coverage JSON payload not found in stdout: ${stdout}`);
	}

	return JSON.parse(stdout.slice(jsonStart)) as Record<string, unknown>;
}

function encodeUtf16LE(value: string): Uint8Array {
	const bytes = new Uint8Array(value.length * 2);
	for (let index = 0; index < value.length; index += 1) {
		const codeUnit = value.charCodeAt(index);
		bytes[index * 2] = codeUnit & 0xff;
		bytes[index * 2 + 1] = codeUnit >>> 8;
	}

	return bytes;
}

function includesByteSequence(
	haystack: Uint8Array,
	needle: Uint8Array,
): boolean {
	if (needle.length === 0) {
		return true;
	}

	for (let offset = 0; offset <= haystack.length - needle.length; offset += 1) {
		let matched = true;
		for (let index = 0; index < needle.length; index += 1) {
			if (haystack[offset + index] !== needle[index]) {
				matched = false;
				break;
			}
		}

		if (matched) {
			return true;
		}
	}

	return false;
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

test("runEntryFiles passes snapshot update mode into harness creation", async () => {
	await withTempEntryFile(
		`
import { test, TestContext } from "node:test";

test("passing test", (_context: TestContext): void => {});
`,
		async (entryFile, cwd) => {
			let capturedOptions: HarnessCreateOptions | undefined;
			const runtime: Runtime = {
				name: "capture",
				mutateCompilerArguments(compilerArguments) {
					jsRuntime.mutateCompilerArguments(compilerArguments);
				},
				createHarness(_wasmBytes, options) {
					capturedOptions = options;
					return createCapturingHarness();
				},
			};

			const result = await runEntryFiles(
				[entryFile],
				cwd,
				{
					error() {},
					info() {},
				},
				runtime,
				{},
				undefined,
				{ enabled: false },
				{ updateSnapshots: true },
			);

			expect(result.exitCode).toBe(RunExitCode.Success);
			expect(capturedOptions).toEqual({
				artifactOptions: {
					projectRoot: cwd,
					sourceFiles: ["suite.test.ts"],
					updateSnapshots: true,
				},
			});
		},
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
import { test } from "node:test";

test("failing abort", (): void => {
  abort("abort payload");
});
`,
		async (entryFile, cwd) => {
			const result = await runCli(entryFile, cwd);

			expect(result.exitCode).toBe(1);
			expect(result.stdout).toBe("");
			expect(result.stderr).toContain(
				"FAIL 0 passed, 1 failed, 1 discovered with js.",
			);
			expect(result.stderr).toContain("- failing abort");
			expect(result.stderr).toContain(
				"  abort: abort payload at suite.test.ts:5:3",
			);
			expect(result.stderr).toContain(
				"    crumb: failing abort kind=2 hook=0 nodeKind=1 at suite.test.ts:5:23 [0]",
			);
			expect(result.stderr).toContain("  fail: failed without a fail message");
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

test("cli run executes uvu fixture and snapshot helpers through the js host", async () => {
	await withTempEntryFile(
		[
			'import { test } from "uvu";',
			'import { fixture, snapshot } from "uvu/assert";',
			"",
			'test("snapshot smoke", (): void => {',
			'\tsnapshot<string>(fixture("cases/alpha.txt"), "snapshot smoke");',
			"});",
			"",
		].join("\n"),
		async (entryFile, cwd) => {
			await mkdir(join(cwd, "__fixtures__", "cases"), { recursive: true });
			await mkdir(join(cwd, "__snapshots__"), { recursive: true });
			await writeFile(
				join(cwd, "__fixtures__", "cases", "alpha.txt"),
				"fixture text\n",
				"utf8",
			);
			await writeFile(
				join(cwd, "__snapshots__", "suite.test.snap"),
				'exports[`snapshot smoke~(0)`] = `"fixture text\\n"`;\n',
				"utf8",
			);

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
});

test("cli run reports mismatched and stale snapshots through the js host", async () => {
	await withTempEntryFile(
		[
			'import { test } from "uvu";',
			'import { snapshot } from "uvu/assert";',
			"",
			'test("snapshot smoke", (): void => {',
			'\tsnapshot<string>("new value", "snapshot smoke");',
			"});",
			"",
		].join("\n"),
		async (entryFile, cwd) => {
			await mkdir(join(cwd, "__snapshots__"), { recursive: true });
			await writeFile(
				join(cwd, "__snapshots__", "suite.test.snap"),
				[
					'exports[`snapshot smoke~(0)`] = `"old value"`;',
					"",
					'exports[`snapshot smoke~(1)`] = `"stale value"`;',
					"",
				].join("\n"),
				"utf8",
			);

			const result = await runCliWithArguments(
				["run", "--harness", "js", entryFile],
				cwd,
			);

			expect(result.exitCode).toBe(1);
			expect(result.stdout).toBe("");
			expect(result.stderr).toContain("snapshot mismatch:");
			expect(result.stderr).toContain("stale snapshot entry:");
		},
	);
});

test("cli run rewrites snapshots in update mode through the js host", async () => {
	await withTempEntryFile(
		[
			'import { test } from "uvu";',
			'import { fixture, snapshot } from "uvu/assert";',
			"",
			'test("snapshot smoke", (): void => {',
			'\tsnapshot<string>(fixture("cases/alpha.txt"), "snapshot smoke");',
			"});",
			"",
		].join("\n"),
		async (entryFile, cwd) => {
			await mkdir(join(cwd, "__fixtures__", "cases"), { recursive: true });
			await mkdir(join(cwd, "__snapshots__"), { recursive: true });
			await writeFile(
				join(cwd, "__fixtures__", "cases", "alpha.txt"),
				"updated fixture\n",
				"utf8",
			);
			await writeFile(
				join(cwd, "__snapshots__", "suite.test.snap"),
				[
					'exports[`snapshot smoke~(0)`] = `"outdated fixture\\n"`;',
					"",
					'exports[`snapshot smoke~(1)`] = `"stale fixture\\n"`;',
					"",
				].join("\n"),
				"utf8",
			);

			const result = await runCliWithArguments(
				["run", "--harness", "js", "--update-snapshots", entryFile],
				cwd,
			);

			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
			expect(result.stdout).toContain(
				"PASS 1 passed, 0 failed, 1 discovered with js.",
			);
			expect(
				await readFile(join(cwd, "__snapshots__", "suite.test.snap"), "utf8"),
			).toContain('exports[`snapshot smoke~(0)`] = `"updated fixture');
		},
	);
});

for (const harnessName of dependencyCliHarnesses) {
	test(
		`cli run compiles and executes node:test dependency handles through the ${harnessName} host`,
		async () => {
			await withTempEntryFile(
				`
import { test, TestContext } from "node:test";

const prereq = test("dependency prereq", (_context: TestContext): void => {});

test("dependency dependent", (_context: TestContext): void => {}).dependsOn(
  prereq,
);
`,
				async (entryFile, cwd) => {
					const result = await runCliWithArguments(
						["run", "--harness", harnessName, entryFile],
						cwd,
					);

					expect(result.exitCode).toBe(0);
					expect(result.stderr).toBe("");
					expect(result.stdout).toContain(
						`PASS 2 passed, 0 failed, 2 discovered with ${harnessName}.`,
					);
				},
			);
		},
		dependencyCliHarnessTimeout,
	);

	test(
		`cli run treats expected-failure prerequisites that fail as satisfied through the ${harnessName} host`,
		async () => {
			await withTempEntryFile(
				`
import { test, TestContext } from "node:test";

const prereq = test.expectFailure(
  "dependency expected failure prereq",
  (context: TestContext): void => {
    context.assert.strictEqual<i32>(61, 62, "dependency expected failure prereq mismatch");
  },
);

test("dependency satisfied dependent", (_context: TestContext): void => {}).dependsOn(
  prereq,
);
`,
				async (entryFile, cwd) => {
					const result = await runCliWithArguments(
						["run", "--harness", harnessName, entryFile],
						cwd,
					);

					expect(result.exitCode).toBe(0);
					expect(result.stderr).toBe("");
					expect(result.stdout).toContain(
						`PASS 2 passed, 0 failed, 2 discovered with ${harnessName}.`,
					);
				},
			);
		},
		dependencyCliHarnessTimeout,
	);

	test(
		`cli run reports guest-declared blocked dependencies through the ${harnessName} host`,
		async () => {
			await withTempEntryFile(
				`
import { test, TestContext } from "node:test";

const prereq = test("dependency failing prereq", (context: TestContext): void => {
  context.assert.strictEqual<i32>(71, 72, "guest dependency prereq mismatch");
});

test("dependency blocked dependent", (_context: TestContext): void => {}).dependsOn(
  prereq,
);
`,
				async (entryFile, cwd) => {
					const result = await runCliWithArguments(
						["run", "--harness", harnessName, entryFile],
						cwd,
					);

					expect(result.exitCode).toBe(1);
					expect(result.stdout).toBe("");
					expect(result.stderr).toContain(
						`FAIL 0 passed, 1 failed, 1 blocked, 2 discovered with ${harnessName}.`,
					);
					expect(result.stderr).toContain("- dependency failing prereq");
					expect(result.stderr).toContain(
						"  fail: guest dependency prereq mismatch",
					);
					expect(result.stderr).toContain("- dependency blocked dependent");
					expect(result.stderr).toContain(
						"  blocked: blocked by prerequisite (id:1)",
					);
				},
			);
		},
		dependencyCliHarnessTimeout,
	);

	test(
		`cli run reports skipped and todo prerequisites as missing dependencies through the ${harnessName} host`,
		async () => {
			await withTempEntryFile(
				`
import { test, TestContext } from "node:test";

const skippedPrereq = test.skip(
  "dependency skipped prereq",
  (_context: TestContext): void => {},
);

test("dependency skipped dependent", (_context: TestContext): void => {}).dependsOn(
  skippedPrereq,
);

const todoPrereq = test.todo(
  "dependency todo prereq",
  (_context: TestContext): void => {},
);

test("dependency todo dependent", (_context: TestContext): void => {}).dependsOn(
  todoPrereq,
);
`,
				async (entryFile, cwd) => {
					const result = await runCliWithArguments(
						["run", "--harness", harnessName, entryFile],
						cwd,
					);

					expect(result.exitCode).toBe(1);
					expect(result.stdout).toBe("");
					expect(result.stderr).toContain(
						`FAIL 0 passed, 0 failed, 2 blocked, 4 discovered with ${harnessName}.`,
					);
					expect(result.stderr).toContain("- dependency skipped dependent");
					expect(result.stderr).toContain(
						"  blocked: missing prerequisite (nodeId:1)",
					);
					expect(result.stderr).toContain("- dependency todo dependent");
					expect(result.stderr).toContain(
						"  blocked: missing prerequisite (nodeId:3)",
					);
					expect(result.stderr).toContain(
						"  issue: missing prerequisite (id:2 <- nodeId:1)",
					);
					expect(result.stderr).toContain(
						"  issue: missing prerequisite (id:4 <- nodeId:3)",
					);
				},
			);
		},
		dependencyCliHarnessTimeout,
	);

	test(
		`cli run reports unexpected-pass expectFailure prerequisites as blocked dependencies through the ${harnessName} host`,
		async () => {
			await withTempEntryFile(
				`
import { test, TestContext } from "node:test";

const prereq = test.expectFailure(
  "dependency unexpected pass prereq",
  (_context: TestContext): void => {},
);

test(
  "dependency unexpected pass dependent",
  (_context: TestContext): void => {},
).dependsOn(prereq);
`,
				async (entryFile, cwd) => {
					const result = await runCliWithArguments(
						["run", "--harness", harnessName, entryFile],
						cwd,
					);

					expect(result.exitCode).toBe(1);
					expect(result.stdout).toBe("");
					expect(result.stderr).toContain(
						`FAIL 0 passed, 1 failed, 1 blocked, 2 discovered with ${harnessName}.`,
					);
					expect(result.stderr).toContain(
						"- dependency unexpected pass prereq",
					);
					expect(result.stderr).toContain(
						"  fail: expected failure passed unexpectedly",
					);
					expect(result.stderr).toContain(
						"- dependency unexpected pass dependent",
					);
					expect(result.stderr).toContain(
						"  blocked: blocked by prerequisite (id:1)",
					);
				},
			);
		},
		dependencyCliHarnessTimeout,
	);

	test(
		`cli run reports only-filtered prerequisites as missing dependencies through the ${harnessName} host`,
		async () => {
			await withTempEntryFile(
				`
import { test, TestContext } from "node:test";

test("dependency only parent", (context: TestContext): void => {
  const prereq = context.test(
    "dependency only filtered prereq",
    (_nestedContext: TestContext): void => {},
  );

  context.runOnly(true);
  context
    .test(
      "dependency only included dependent",
      (_nestedContext: TestContext): void => {},
    )
    .dependsOn(prereq);
});
`,
				async (entryFile, cwd) => {
					const result = await runCliWithArguments(
						["run", "--harness", harnessName, entryFile],
						cwd,
					);

					expect(result.exitCode).toBe(1);
					expect(result.stdout).toBe("");
					expect(result.stderr).toContain(
						`FAIL 1 passed, 0 failed, 1 blocked, 2 discovered with ${harnessName}.`,
					);
					expect(result.stderr).not.toContain(
						"- dependency only filtered prereq",
					);
					expect(result.stderr).toContain(
						"- dependency only included dependent",
					);
					expect(result.stderr).toContain(
						"  blocked: missing prerequisite (nodeId:2)",
					);
					expect(result.stderr).toContain(
						"  issue: missing prerequisite (id:1/id:3 <- nodeId:2)",
					);
				},
			);
		},
		dependencyCliHarnessTimeout,
	);

	test(
		`cli run collapses duplicate dependency edges through the ${harnessName} host`,
		async () => {
			await withTempEntryFile(
				`
import { test, TestContext } from "node:test";

const prereq = test("duplicate-edge prereq", (_context: TestContext): void => {});
const dependent = test("duplicate-edge dependent", (_context: TestContext): void => {});

dependent.dependsOn(prereq).dependsOn(prereq);
`,
				async (entryFile, cwd) => {
					const result = await runCliWithArguments(
						["run", "--harness", harnessName, entryFile],
						cwd,
					);

					expect(result.exitCode).toBe(0);
					expect(result.stderr).toBe("");
					expect(result.stdout).toContain(
						`PASS 2 passed, 0 failed, 2 discovered with ${harnessName}.`,
					);
				},
			);
		},
		dependencyCliHarnessTimeout,
	);

	test(
		`cli run reports dependency cycles distinctly through the ${harnessName} host`,
		async () => {
			await withTempEntryFile(
				`
import { test, TestContext } from "node:test";

const first = test("cycle a", (_context: TestContext): void => {});
const second = test("cycle b", (_context: TestContext): void => {}).dependsOn(first);

first.dependsOn(second);
`,
				async (entryFile, cwd) => {
					const result = await runCliWithArguments(
						["run", "--harness", harnessName, entryFile],
						cwd,
					);

					expect(result.exitCode).toBe(1);
					expect(result.stdout).toBe("");
					expect(result.stderr).toContain(
						`FAIL 0 passed, 0 failed, 2 blocked, 2 discovered with ${harnessName}.`,
					);
					expect(result.stderr).toContain("- cycle a");
					expect(result.stderr).toContain("  blocked: dependency cycle");
					expect(result.stderr).toContain("- cycle b");
					expect(result.stderr).toContain("  issue: dependency cycle (id:1)");
					expect(result.stderr).toContain("  issue: dependency cycle (id:2)");
					expect(result.stderr).not.toContain("missing-dependency");
					expect(result.stderr).not.toContain("blocked-dependency");
				},
			);
		},
		dependencyCliHarnessTimeout,
	);

	test(
		`cli run proves the documented dependency-policy matrix through the ${harnessName} host`,
		async () => {
			await withTempEntryFile(
				`
import { test, TestContext } from "node:test";

const expectedFailurePrereq = test.expectFailure(
  "dependency expected failure prereq",
  (context: TestContext): void => {
    context.assert.strictEqual<i32>(81, 82, "dependency expected failure prereq mismatch");
  },
);

test("dependency satisfied dependent", (_context: TestContext): void => {}).dependsOn(
  expectedFailurePrereq,
);

const unexpectedPassPrereq = test.expectFailure(
  "dependency unexpected pass prereq",
  (_context: TestContext): void => {},
);

test(
  "dependency unexpected pass dependent",
  (_context: TestContext): void => {},
).dependsOn(unexpectedPassPrereq);

const skippedPrereq = test.skip(
  "dependency skipped prereq",
  (_context: TestContext): void => {},
);

test("dependency skipped dependent", (_context: TestContext): void => {}).dependsOn(
  skippedPrereq,
);

const todoPrereq = test.todo(
  "dependency todo prereq",
  (_context: TestContext): void => {},
);

test("dependency todo dependent", (_context: TestContext): void => {}).dependsOn(
  todoPrereq,
);

test("dependency only parent", (context: TestContext): void => {
  const prereq = context.test(
    "dependency only filtered prereq",
    (_nestedContext: TestContext): void => {},
  );

  context.runOnly(true);
  context
    .test(
      "dependency only included dependent",
      (_nestedContext: TestContext): void => {},
    )
    .dependsOn(prereq);
});
`,
				async (entryFile, cwd) => {
					const result = await runCliWithArguments(
						["run", "--harness", harnessName, entryFile],
						cwd,
					);

					expect(result.exitCode).toBe(1);
					expect(result.stdout).toBe("");
					expect(result.stderr).toContain(
						`FAIL 3 passed, 1 failed, 4 blocked, 10 discovered with ${harnessName}.`,
					);
					expect(result.stderr).not.toContain(
						"- dependency expected failure prereq",
					);
					expect(result.stderr).not.toContain(
						"- dependency satisfied dependent",
					);
					expect(result.stderr).toContain(
						"- dependency unexpected pass prereq",
					);
					expect(result.stderr).toContain(
						"  fail: expected failure passed unexpectedly",
					);
					expect(result.stderr).toContain(
						"- dependency unexpected pass dependent",
					);
					expect(result.stderr).toContain(
						"  blocked: blocked by prerequisite (id:3)",
					);
					expect(result.stderr).toContain("- dependency skipped dependent");
					expect(result.stderr).toContain(
						"  blocked: missing prerequisite (nodeId:5)",
					);
					expect(result.stderr).toContain("- dependency todo dependent");
					expect(result.stderr).toContain(
						"  blocked: missing prerequisite (nodeId:7)",
					);
					expect(result.stderr).toContain(
						"- dependency only included dependent",
					);
					expect(result.stderr).toContain(
						"  blocked: missing prerequisite (nodeId:10)",
					);
					expect(result.stderr).not.toContain(
						"  issue: blocked-dependency (id:4 <- id:3)",
					);
					expect(result.stderr).toContain(
						"  issue: missing prerequisite (id:6 <- nodeId:5)",
					);
					expect(result.stderr).toContain(
						"  issue: missing prerequisite (id:8 <- nodeId:7)",
					);
					expect(result.stderr).toContain(
						"  issue: missing prerequisite (id:9/id:11 <- nodeId:10)",
					);
				},
			);
		},
		dependencyCliHarnessTimeout,
	);
}

test("the bundled compile path stamps artifact-frame source metadata into emitted modules", async () => {
	await withTempEntryFile(
		`
import { beforeEach, describe, it, TestContext } from "mocha";
import { hasActiveArtifactFrame } from "~/.as-harness/exports";
import { captureActiveArtifactFrame } from "~/.as-harness/internal/imports";

function captureWhenActive(): void {
  if (!hasActiveArtifactFrame()) {
    return;
  }

  captureActiveArtifactFrame();
}

describe("artifact suite", (_context): void => {
  beforeEach((_hookContext: TestContext): void => {
    captureWhenActive();
  });

  it("artifact test", (_context: TestContext): void => {
    captureWhenActive();
  });
});
`,
		async (_entryFile, cwd) => {
			const wrapperPath = join(cwd, "entry.ts");
			await writeFile(
				wrapperPath,
				[
					'export { allocateNodeIndexBuffer, discover, invoke, run } from "~/.as-harness/exports";',
					'import "./suite.test.ts";',
					"",
				].join("\n"),
				"utf8",
			);
			const artifacts = await compileEntrypoints(
				[wrapperPath],
				{
					baseDir: cwd,
					lib: ["node:test", "node:assert", "node:assert/strict"],
				},
				jsRuntime,
			);
			const wasmArtifact = artifacts.find((artifact) =>
				artifact.path.endsWith(".wasm"),
			);
			if (!wasmArtifact) {
				throw new Error(
					"Compilation completed without emitting a wasm artifact.",
				);
			}
			expect(
				includesByteSequence(
					wasmArtifact.contents,
					encodeUtf16LE("suite.test.ts"),
				),
			).toBe(true);
		},
	);
});

// The wazero variant of this bundled-library CLI smoke is already covered by
// the package-local native host suite and the npm install smoke. Running that
// same scenario through Bun's root test-runner subprocess supervision is
// currently nondeterministic, so keep this root-level loop on the stable hosts.
for (const harnessName of dependencyCliHarnesses.filter(
	(name) => name !== "wazero",
)) {
	test(
		`cli run executes the bundled "as-harness" guest library through the ${harnessName} host`,
		async () => {
			await withTempEntryFile(
				`
import {
  afterEach,
  beforeAll,
  beforeEach,
  sequential,
  SuiteContext,
  test,
  TestContext,
} from "as-harness";

let beforeEachCount = 0;
let afterEachCount = 0;
let suiteSetupCount = 0;

beforeAll((_context: TestContext): void => {
  suiteSetupCount = 1;
});

beforeEach((_context: TestContext): void => {
  beforeEachCount += 1;
});

afterEach((_context: TestContext): void => {
  afterEachCount += 1;
});

const prereq = test("native prereq", (_context: TestContext): void => {});

test("native dependent", (context: TestContext): void => {
  context.assert.strictEqual<i32>(suiteSetupCount, 1, "suite setup mismatch");
  context.assert.strictEqual<bool>(beforeEachCount > 0, true, "beforeEach missing");
  context.assert.strictEqual<bool>(afterEachCount == 0, true, "afterEach ran too early");
  context.diagnostic("as-harness dependent diagnostic");
}).dependsOn(prereq);

sequential("ordered group", (_context: SuiteContext): void => {
  test("ordered first", (_context: TestContext): void => {});
  test("ordered second", (_context: TestContext): void => {});
});
`,
				async (entryFile, cwd) => {
					const result = await runCliWithArguments(
						["run", "--harness", harnessName, entryFile],
						cwd,
					);

					expect(result.exitCode).toBe(0);
					expect(result.stderr).toBe("");
					expect(result.stdout).toContain(
						`PASS 4 passed, 0 failed, 4 discovered with ${harnessName}.`,
					);
				},
			);
		},
		bundledGuestLibraryCliHarnessTimeout,
	);
}

test('cli run executes a thin jest adapter entry from the bundled "jest" guest library', async () => {
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
				["run", "--harness", "js", entryFile],
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

test('cli run executes a thin mocha adapter entry from the bundled "mocha" guest library', async () => {
	await withTempEntryFile(
		`
import {
  after,
  afterEach,
  before,
  beforeEach,
  context,
  describe,
  it,
  specify,
  TestContext,
  xcontext,
  xdescribe,
  xit,
  xspecify,
} from "mocha";

let suiteSetupCount = 0;
let beforeEachCount = 0;
let afterEachCount = 0;
let afterAllCount = 0;

function shouldNeverExecuteSkipAlias(): void {
  unreachable();
}

before((_context: TestContext): void => {
  suiteSetupCount = 1;
});

beforeEach((_context: TestContext): void => {
  beforeEachCount += 1;
});

afterEach((_context: TestContext): void => {
  afterEachCount += 1;
});

after((_context: TestContext): void => {
  afterAllCount = beforeEachCount;
});

describe("mocha adapter", (_context): void => {
  xdescribe("xdescribe branch", (_nestedContext): void => {
    it("nested xdescribe child", (_context: TestContext): void => {
      shouldNeverExecuteSkipAlias();
    });
  });

  xcontext("xcontext branch", (_nestedContext): void => {
    specify("nested xcontext child", (_context: TestContext): void => {
      shouldNeverExecuteSkipAlias();
    });
  });

  xit("xit leaf", (_context: TestContext): void => {
    shouldNeverExecuteSkipAlias();
  });

  xspecify("xspecify leaf", (_context: TestContext): void => {
    shouldNeverExecuteSkipAlias();
  });

  context("context alias", (_nestedContext): void => {
    it("nested context child", (_context: TestContext): void => {});
  });

  it("top-level pass", (_context: TestContext): void => {});
  it("implicit pending");

  specify("passes through mocha adapter", (context: TestContext): void => {
    context.assert.strictEqual<i32>(suiteSetupCount, 1, "suite setup mismatch");
    context.assert.strictEqual<bool>(beforeEachCount > 0, true, "beforeEach missing");
    context.assert.strictEqual<i32>(afterEachCount + 1, beforeEachCount, "afterEach ordering mismatch");
    context.assert.strictEqual<i32>(afterAllCount, 0, "after ran too early");
    context.diagnostic("mocha adapter diagnostic");
  });
});
`,
		async (entryFile, cwd) => {
			const result = await runCliWithArguments(
				["run", "--harness", "js", entryFile],
				cwd,
			);

			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
			expect(result.stdout).toContain(
				"PASS 3 passed, 0 failed, 6 discovered with js.",
			);
		},
	);
});

test('cli run executes a thin jasmine adapter entry from the bundled "jasmine" guest library', async () => {
	await withTempEntryFile(
		`
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  fail,
  fdescribe,
  fit,
  it,
  TestContext,
  xdescribe,
  xit,
} from "jasmine";

let suiteSetupCount = 0;
let beforeEachCount = 0;
let afterEachCount = 0;
let afterAllCount = 0;

function failImmediately(): void {
  fail("jasmine fail trap");
}

beforeAll((_context: TestContext): void => {
  suiteSetupCount = 1;
});

beforeEach((_context: TestContext): void => {
  beforeEachCount += 1;
});

afterEach((_context: TestContext): void => {
  afterEachCount += 1;
});

afterAll((_context: TestContext): void => {
  afterAllCount = beforeEachCount;
});

describe("filtered suite", (_context): void => {
  it("filtered child", (_context: TestContext): void => {
    unreachable();
  });
});

fdescribe("focused jasmine suite", (_context): void => {
  xdescribe("xdescribe branch", (_nestedContext): void => {
    it("nested xdescribe child", (_context: TestContext): void => {
      unreachable();
    });
  });

  xit("xit leaf", (_context: TestContext): void => {
    unreachable();
  });

  it("implicit pending");
  it("plain pass", (_context: TestContext): void => {});

  it("runs hooks and matchers", (context: TestContext): void => {
    const maybeNothing = <string | null>null;

    expect<i32>(suiteSetupCount).toBe(1);
    expect<i32>(beforeEachCount).toBeGreaterThan(0);
    expect<i32>(afterEachCount + 1).toBe(beforeEachCount);
    expect<i32>(afterAllCount).toBe(0);
    expect<Array<i32>>([1, 2, 3]).toEqual([1, 2, 3]);
    expect<Array<i32>>([1, 2, 3]).toContain(2);
    expect<string | null>("value").toBeDefined();
    expect<bool>(false).toBeFalsy();
    expect<bool>(true).toBeTruthy();
    expect<string | null>(maybeNothing).toBeNull();
    expect<string | null>(maybeNothing).toBeUndefined();
    expect<i32>(5).toBeGreaterThan(4);
    expect<i32>(4).toBeLessThan(5);
    expect<f64>(NaN).toBeNaN();
    expect<() => void>(failImmediately).toThrow();
    expect<() => void>(((): void => {})).not.toThrow();
    context.diagnostic("jasmine adapter diagnostic");
  });
});
`,
		async (entryFile, cwd) => {
			const result = await runCliWithArguments(
				["run", "--harness", "js", entryFile],
				cwd,
			);

			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
			expect(result.stdout).toContain(
				"PASS 2 passed, 0 failed, 4 discovered with js.",
			);
		},
	);
});

test('cli run executes a thin ava adapter entry from the bundled "ava" guest library', async () => {
	await withTempEntryFile(
		`
import test from "ava";
import { ExecutionContext } from "ava";

let beforeCount = 0;
let beforeEachCount = 0;
let afterEachCount = 0;
let afterAllCount = 0;

const titledMacro = test.macro<string>(
  (context: ExecutionContext, values: Array<string>): void => {
    context.is<string>(values.join(","), "alpha,beta");
    context.is<string>(context.title, "macro title alpha beta");
  },
  (providedTitle: string, values: Array<string>): string => {
    return "  " + providedTitle + "   " + values.join("   ") + "  ";
  },
);

test.before((context: ExecutionContext): void => {
  beforeCount = 1;
  context.context.set("trace", "");
});

test.beforeEach((context: ExecutionContext): void => {
  beforeEachCount += 1;
  context.context.set("trace", "beforeEach|" + context.title);
});

test.afterEach((context: ExecutionContext): void => {
  afterEachCount += 1;
  context.context.set("trace", context.context.get("trace") + ">afterEach|" + context.title);
});

test.after.always((_context: ExecutionContext): void => {
  afterAllCount = beforeEachCount;
});

test.skip("skipped test", (_context: ExecutionContext): void => {});
test.todo("todo test");

test.serial.failing("expected failure", (context: ExecutionContext): void => {
  context.is<i32>(11, 12, "ava adapter expected failure mismatch");
});

test.serial("passes through ava adapter", (context: ExecutionContext): void => {
  context.is<i32>(beforeCount, 1, "before hook mismatch");
  context.true(beforeEachCount > 0, "beforeEach missing");
  context.is<i32>(afterEachCount + 1, beforeEachCount, "afterEach ordering mismatch");
  context.is<i32>(afterAllCount, 0, "afterAll ran too early");
  context.is<string>(
    context.context.get("trace"),
    "beforeEach|passes through ava adapter",
    "ava trace mismatch",
  );
  context.log("ava adapter diagnostic");
});

test.serial.useNamed("macro title", titledMacro, "alpha", "beta");
`,
		async (entryFile, cwd) => {
			const result = await runCliWithArguments(
				["run", "--harness", "js", entryFile],
				cwd,
			);

			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
			expect(result.stdout).toContain(
				"PASS 3 passed, 0 failed, 5 discovered with js.",
			);
		},
	);
});

test('cli run executes a thin tap adapter entry from the bundled "tap" guest library', async () => {
	await withTempEntryFile(
		`
import tap from "tap";
import { Test, after, afterEach, before, beforeEach, test } from "tap";

let beforeCount = 0;
let afterCount = 0;

before((_context: Test): void => {
  beforeCount = 1;
});

beforeEach((context: Test): void => {
  context.comment("tap beforeEach|" + context.name);
});

afterEach((context: Test): void => {
  context.comment("tap afterEach|" + context.name);
});

after((_context: Test): void => {
  afterCount = beforeCount;
});

tap.skip("skipped tap test", (_context: Test): void => {});
tap.todo("todo tap test", (_context: Test): void => {});

test("passes through tap adapter", (context: Test): void => {
  context.plan(2);
  context.before((hookContext: Test): void => {
    hookContext.comment("tap nested before|" + hookContext.name);
  });
  context.after((hookContext: Test): void => {
    hookContext.comment("tap nested after|" + hookContext.name);
  });
  context.test("nested tap child", (child: Test): void => {
    child.plan(13);
    child.pass("tap child pass");
    child.ok<bool>(true);
    child.notOk<i32>(0);
    child.equal<i32>(child.count, 3);
    child.not<i32>(11, 12);
    child.same<Array<i32>>([1, 2], [1, 2]);
    child.notSame<Array<i32>>([1, 2], [1, 3]);
    child.strictSame<Array<i32>>([2, 3], [2, 3]);
    child.strictNotSame<Array<i32>>([2, 3], [2, 4]);
    child.throws((): void => {
      unreachable();
    });
    child.doesNotThrow((): void => {});
    child.type<string>("tap", "string");
    child.error<string | null>(null);
    child.end();
  });
  context.equal<i32>(afterCount, 0, "tap after ran too early");
  context.pass();
  context.end();
});
`,
		async (entryFile, cwd) => {
			const result = await runCliWithArguments(
				["run", "--harness", "js", entryFile],
				cwd,
			);

			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
			expect(result.stdout).toContain(
				"PASS 2 passed, 0 failed, 4 discovered with js.",
			);
		},
	);
});

test('cli run executes a thin tape adapter entry from the bundled "tape" guest library', async () => {
	await withTempEntryFile(
		`
import test from "tape";
import { TestContext } from "tape";

let teardownCount = 0;

test.skip("skipped tape test", (_context: TestContext): void => {});

test("passes through tape adapter", (context: TestContext): void => {
  context.plan(2);
  context.comment("tape adapter diagnostic");
  context.teardown((_teardownContext: TestContext): void => {
    teardownCount += 1;
  });
  context.test("nested tape child", (child: TestContext): void => {
    child.plan(7);
    child.pass();
    child.ok<bool>(true);
    child.notOk<i32>(0);
    child.equal<i32>(11, 11);
    child.deepEqual<Array<i32>>([1, 2], [1, 2]);
    child.throws((): void => {
      unreachable();
    });
    child.doesNotThrow((): void => {});
    child.end();
  });
  context.equal<i32>(teardownCount, 0, "teardown ran too early");
  context.pass();
  context.end();
});
`,
		async (entryFile, cwd) => {
			const result = await runCliWithArguments(
				["run", "--harness", "js", entryFile],
				cwd,
			);

			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
			expect(result.stdout).toContain(
				"PASS 2 passed, 0 failed, 3 discovered with js.",
			);
		},
	);
});

test('cli run executes a thin qunit adapter entry from the bundled "qunit" guest library', async () => {
	await withTempEntryFile(
		`
import QUnit from "qunit";
import { Assert, NestedHooks } from "qunit";
import { module as qunitModule, test as qunitTest } from "qunit";

let rootBeforeEachCount = 0;
let rootAfterEachCount = 0;

QUnit.hooks.beforeEach((assert: Assert): void => {
  rootBeforeEachCount += 1;
  assert.step("root beforeEach");
});

QUnit.hooks.afterEach((_assert: Assert): void => {
  rootAfterEachCount += 1;
});

QUnit.skip("skipped qunit test");
qunitTest.todo("todo qunit test");

QUnit.module("qunit adapter", (hooks: NestedHooks): void => {
  hooks.beforeEach((assert: Assert): void => {
    assert.step("module beforeEach");
  });

  QUnit.test("passes through qunit", (assert: Assert): void => {
    assert.expect(6);
    assert.strictEqual<i32>(rootBeforeEachCount, 1, "beforeEach count mismatch");
    assert.strictEqual<i32>(rootAfterEachCount, 0, "afterEach ran too early");
    assert.step("body");
    assert.verifySteps(["root beforeEach", "module beforeEach", "body"]);
  });
});

qunitModule.todo("todo qunit module", (_hooks: NestedHooks): void => {
  QUnit.test("expected failure", (assert: Assert): void => {
    assert.expect(2);
    assert.strictEqual<i32>(11, 12, "qunit todo mismatch");
  });
});
`,
		async (entryFile, cwd) => {
			const result = await runCliWithArguments(
				["run", "--harness", "js", entryFile],
				cwd,
			);

			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
			expect(result.stdout).toContain(
				"PASS 2 passed, 0 failed, 4 discovered with js.",
			);
		},
	);
});

test('cli run executes the bundled "uvu/assert" guest library through the js host', async () => {
	await withTempEntryFile(
		`
import { test, TestContext } from "node:test";
import { Assertion, equal, is, not, ok, throws, type } from "uvu/assert";

function failViaNullAccess(): void {
  unreachable();
}

function doesNotTrap(): void {}

test("passes through uvu/assert", (context: TestContext): void => {
  const assertion = new Assertion("manual", "equal", "[1]", "[2]");
  is<string>(assertion.name, "Assertion");
  is<string>(assertion.code, "ERR_ASSERTION");
  ok<bool>(true);
  is<i32>(11, 11);
  is.not<i32>(11, 12);
  equal<Array<i32>>([1, 2], [1, 2]);
  type<i32>(11, "number");
  type<string>("uvu", "string");
  throws(failViaNullAccess);
  not<i32>(11, 12);
  not.equal<Array<i32>>([1, 2], [1, 3]);
  not.type<i32>(11, "string");
  not.throws(doesNotTrap);
  context.diagnostic("uvu assert diagnostic");
});
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
});

test('cli run executes the bundled "uvu" guest library through the js host', async () => {
	await withTempEntryFile(
		`
import { equal, is, not, ok, unreachable } from "uvu/assert";
import { exec, suite, test, TestContext } from "uvu";

let rootBeforeEachCount = 0;
let rootAfterEachCount = 0;
let suiteBeforeCount = 0;
let suiteBeforeEachCount = 0;
let suiteAfterEachCount = 0;
let suiteAfterCount = 0;

function trapViaUnreachable(): void {
  unreachable("uvu cli trap");
}

test.before((_context: TestContext): void => {});

test.before.each((_context: TestContext): void => {
  rootBeforeEachCount += 1;
});

test.after.each((_context: TestContext): void => {
  rootAfterEachCount += 1;
});

test.after((_context: TestContext): void => {});

test.inBand();
test.inBand(false);
test.bail();
test.continueOnFailure();
exec(false);

const adapterSuite = suite("uvu adapter");
adapterSuite.inBand();
adapterSuite.bail();
adapterSuite.continueOnFailure();

adapterSuite.before((_context: TestContext): void => {
  suiteBeforeCount += 1;
});

adapterSuite.beforeEach((_context: TestContext): void => {
  suiteBeforeEachCount += 1;
});

adapterSuite.afterEach((_context: TestContext): void => {
  suiteAfterEachCount += 1;
});

adapterSuite.after((_context: TestContext): void => {
  suiteAfterCount = suiteBeforeEachCount;
});

adapterSuite.skip("skipped child", (_context: TestContext): void => {
  trapViaUnreachable();
});

adapterSuite.only("focused child", (context: TestContext): void => {
  context.assert.strictEqual<bool>(rootBeforeEachCount > 0, true, "root beforeEach missing");
  context.assert.strictEqual<i32>(rootAfterEachCount + 1, rootBeforeEachCount, "root afterEach ordering mismatch");
  context.assert.strictEqual<i32>(suiteBeforeCount, 1, "suite before mismatch");
  context.assert.strictEqual<bool>(suiteBeforeEachCount > 0, true, "suite beforeEach missing");
  context.assert.strictEqual<i32>(suiteAfterEachCount + 1, suiteBeforeEachCount, "suite afterEach ordering mismatch");
  context.assert.strictEqual<i32>(suiteAfterCount, 0, "suite after ran too early");
  ok<bool>(true);
  is<i32>(21, 21);
  is.not<i32>(21, 22);
  equal<Array<i32>>([1, 2], [1, 2]);
  not<i32>(21, 22);
  not.equal<Array<i32>>([1, 2], [1, 3]);
  context.assert.throws(trapViaUnreachable);
  context.diagnostic("uvu adapter diagnostic");
});

adapterSuite.run();
exec(false);
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
});

test('cli run executes a thin vitest adapter entry from the bundled "vitest" guest library', async () => {
	await withTempEntryFile(
		`
import {
  afterEach,
  assertType,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  suite,
  test,
  TestContext,
} from "vitest";

let beforeEachCount = 0;
let afterEachCount = 0;
let suiteSetupCount = 0;

function shouldNeverExecuteSkippedSuite(): void {
  unreachable();
}

function throwsUnreachable(): void {
  unreachable();
}

const strictArrayNeedle = [2, 3];
const strictArrayHaystack = [strictArrayNeedle, [4, 5]];

beforeAll((_context: TestContext): void => {
  suiteSetupCount = 1;
});

beforeEach((_context: TestContext): void => {
  beforeEachCount += 1;
});

afterEach((_context: TestContext): void => {
  afterEachCount += 1;
});

describe("vitest adapter", (_context): void => {
  suite.skipIf(true)("skipped suite", (_nestedContext): void => {
    shouldNeverExecuteSkippedSuite();
  });

  describe.runIf(false)("runIf skipped suite", (_nestedContext): void => {
    shouldNeverExecuteSkippedSuite();
  });

  test.fails("expected failure metadata", (context: TestContext): void => {
    context.assert.strictEqual<i32>(31, 32, "vitest expected failure mismatch");
  });
  test("implicit todo metadata");
  test.sequential("sequential pass", (_context: TestContext): void => {});
  it.sequential("sequential it pass", (_context: TestContext): void => {});
  test.concurrent("concurrent pass", (_context: TestContext): void => {});
  it.concurrent("concurrent it pass", (_context: TestContext): void => {});
  suite.concurrent("concurrent suite alias", (_nestedContext): void => {
    test("nested concurrent suite alias child", (_context: TestContext): void => {});
  });
  suite.sequential("sequential suite alias", (_nestedContext): void => {
    test("nested suite alias child", (_context: TestContext): void => {});
  });
  describe.concurrent("concurrent suite", (_nestedContext): void => {
    test("nested concurrent child", (_context: TestContext): void => {});
  });
  describe.sequential("sequential suite", (_nestedContext): void => {
    test.concurrent("nested sequential concurrent child a", (_context: TestContext): void => {});
    test.concurrent("nested sequential concurrent child b", (_context: TestContext): void => {});
  });
  test.skipIf(false)("conditional pass", (_context: TestContext): void => {});

  it("passes through vitest adapter", (context: TestContext): void => {
    assertType<i32>(suiteSetupCount);
    expect<i32>(suiteSetupCount).toBe(1);
    expect<i32>(beforeEachCount).toBeGreaterThan(0);
    expect<Array<Array<i32>>>(strictArrayHaystack).toContain(strictArrayNeedle);
    expect<Array<Array<i32>>>(strictArrayHaystack).toContainEqual([2, 3]);
    expect<Array<i32>>([1, 2, 3]).toHaveLength(3);
    expect<i32>(5).toBeGreaterThan(4);
    expect<i32>(4).toBeLessThan(5);
    expect<f64>(NaN).toBeNaN();
    expect<() => void>(throwsUnreachable).toThrow();
    context.diagnostic("vitest adapter diagnostic");
  });
});
`,
		async (entryFile, cwd) => {
			const result = await runCliWithArguments(
				["run", "--harness", "js", entryFile],
				cwd,
			);

			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
			expect(result.stdout).toContain(
				"PASS 12 passed, 0 failed, 13 discovered with js.",
			);
		},
	);
});

test("cli run emits coverage output through the js harness", async () => {
	await withTempEntryFile(
		`
import { test, TestContext } from "node:test";

function branch(value: i32): i32 {
  if (value > 0) {
    return value;
  }

  return -value;
}

test("coverage smoke", (context: TestContext): void => {
  context.assert.strictEqual<i32>(branch(3), 3);
});
`,
		async (entryFile, cwd) => {
			const result = await runCliWithArguments(
				["run", "--harness", "js", "--coverage", entryFile],
				cwd,
			);

			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
			expect(result.stdout).toContain(
				"PASS 1 passed, 0 failed, 1 discovered with js.",
			);
			expect(result.stdout).toContain("Coverage:");
			expect(result.stdout).toContain("suite.test.ts");
			expect(result.stdout).toContain("uncovered");
		},
	);
});

test("cli run applies coverage include, exclude, and point-type options", async () => {
	await withTempEntryFile(
		`
import { test, TestContext } from "node:test";

function branch(value: i32): i32 {
  if (value > 0) {
    return value + 1;
  }

  return -value;
}

test("coverage filtering smoke", (context: TestContext): void => {
  context.assert.strictEqual<i32>(branch(3), 4);
});
`,
		async (entryFile, cwd) => {
			const includedResult = await runCliWithArguments(
				[
					"run",
					"--harness",
					"js",
					"--coverage",
					"--coverage-format",
					"json",
					"--coverage-include",
					"suite.test.ts",
					"--coverage-point-type",
					"function",
					entryFile,
				],
				cwd,
			);

			expect(includedResult.exitCode).toBe(0);
			expect(includedResult.stderr).toBe("");
			const includedReport = parseCoverageJSONFromStdout(includedResult.stdout);
			expect(
				Object.keys(includedReport).some((file) =>
					file.endsWith("suite.test.ts"),
				),
			).toBe(true);
			expect(includedResult.stdout).toContain('"coverType": 1');
			expect(includedResult.stdout).not.toContain('"coverType": 2');
			expect(includedResult.stdout).not.toContain('"coverType": 3');

			const excludedResult = await runCliWithArguments(
				[
					"run",
					"--harness",
					"js",
					"--coverage",
					"--coverage-format",
					"json",
					"--coverage-exclude",
					"suite.test.ts",
					entryFile,
				],
				cwd,
			);

			expect(excludedResult.exitCode).toBe(0);
			expect(excludedResult.stderr).toBe("");
			expect(parseCoverageJSONFromStdout(excludedResult.stdout)).toEqual({});
		},
	);
});

test("cli run emits coverage output through the wasmtime harness", async () => {
	if (!existsSync(wasmtimeAddonPath)) {
		return;
	}

	await withTempEntryFile(
		`
import { test, TestContext } from "node:test";

function branch(value: i32): i32 {
  if (value > 0) {
    return value;
  }

  return -value;
}

test("coverage smoke", (context: TestContext): void => {
  context.assert.strictEqual<i32>(branch(3), 3);
});
`,
		async (entryFile, cwd) => {
			const result = await runCliWithArguments(
				["run", "--harness", "wasmtime", "--coverage", entryFile],
				cwd,
			);

			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
			expect(result.stdout).toContain(
				"PASS 1 passed, 0 failed, 1 discovered with wasmtime.",
			);
			expect(result.stdout).toContain("Coverage:");
			expect(result.stdout).toContain("suite.test.ts");
		},
	);
});
