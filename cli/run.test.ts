import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { resolveRunEntrypointBaseDirectory } from "./run";

const cliEntrypointPath = join(import.meta.dir, "index.ts");
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
	"wazero",
	...(existsSync(wasmtimeAddonPath) ? ["wasmtime"] : []),
] as const;

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

function parseCoverageJSONFromStdout(stdout: string) {
	const jsonStart = stdout.indexOf("{");
	if (jsonStart === -1) {
		throw new Error(`Coverage JSON payload not found in stdout: ${stdout}`);
	}

	return JSON.parse(stdout.slice(jsonStart)) as Record<string, unknown>;
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

for (const harnessName of dependencyCliHarnesses) {
	test(`cli run compiles and executes node:test dependency handles through the ${harnessName} host`, async () => {
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
	});

	test(`cli run treats expected-failure prerequisites that fail as satisfied through the ${harnessName} host`, async () => {
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
	});

	test(`cli run reports guest-declared blocked dependencies through the ${harnessName} host`, async () => {
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
	});

	test(`cli run reports skipped and todo prerequisites as missing dependencies through the ${harnessName} host`, async () => {
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
	});

	test(`cli run reports unexpected-pass expectFailure prerequisites as blocked dependencies through the ${harnessName} host`, async () => {
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
				expect(result.stderr).toContain("- dependency unexpected pass prereq");
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
	});

	test(`cli run reports only-filtered prerequisites as missing dependencies through the ${harnessName} host`, async () => {
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
				expect(result.stderr).toContain("- dependency only included dependent");
				expect(result.stderr).toContain(
					"  blocked: missing prerequisite (nodeId:2)",
				);
				expect(result.stderr).toContain(
					"  issue: missing prerequisite (id:1/id:3 <- nodeId:2)",
				);
			},
		);
	});

	test(`cli run collapses duplicate dependency edges through the ${harnessName} host`, async () => {
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
	});

	test(`cli run reports dependency cycles distinctly through the ${harnessName} host`, async () => {
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
	});

	test(`cli run proves the documented dependency-policy matrix through the ${harnessName} host`, async () => {
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
				expect(result.stderr).not.toContain("- dependency satisfied dependent");
				expect(result.stderr).toContain("- dependency unexpected pass prereq");
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
				expect(result.stderr).toContain("- dependency only included dependent");
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
	});
}

for (const harnessName of dependencyCliHarnesses) {
	test(`cli run executes the bundled "as-harness" guest library through the ${harnessName} host`, async () => {
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
	});
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
  suite.sequential("sequential suite alias", (_nestedContext): void => {
    test("nested suite alias child", (_context: TestContext): void => {});
  });
  describe.sequential("sequential suite", (_nestedContext): void => {
    test("nested sequential child", (_context: TestContext): void => {});
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
				"PASS 7 passed, 0 failed, 8 discovered with js.",
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
