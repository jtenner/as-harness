import { expect, test } from "bun:test";
import { createMemoryStream, main as runAsc } from "assemblyscript/asc";
import {
	mkdtemp,
	mkdir,
	readdir,
	readFile as readFileFromDisk,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve } from "node:path";
import {
	BUNDLED_COVERAGE_TRANSFORM_PATH,
	BUNDLED_LIBRARY_COMPONENTS_PATH,
	BUNDLED_STRICT_EQUALITY_TRANSFORM_PATH,
	withBundledHarnessLibraryComponents,
	withBundledCoverageTransform,
	withBundledStrictEqualityTransform,
} from "./compile";
import {
	bundledVirtualFiles,
	bundledVirtualRoot,
} from "./virtual-files.generated";

test("does not rewrite custom library paths when bundled harness libraries are absent", () => {
	const compilerOptions = {
		lib: ["./custom-lib"],
	};

	const result = withBundledHarnessLibraryComponents(compilerOptions);

	expect(result).toEqual(compilerOptions);
});

test("rewrites node:assert to the bundled harness library root", () => {
	const result = withBundledHarnessLibraryComponents({
		lib: ["node:assert"],
	});

	expect(result.lib).toEqual([BUNDLED_LIBRARY_COMPONENTS_PATH]);
});

test("rewrites node:test to the bundled harness library root", () => {
	const result = withBundledHarnessLibraryComponents({
		lib: ["node:test"],
	});

	expect(result.lib).toEqual([BUNDLED_LIBRARY_COMPONENTS_PATH]);
});

test('rewrites "as-harness" to the bundled harness library root', () => {
	const result = withBundledHarnessLibraryComponents({
		lib: ["as-harness"],
	});

	expect(result.lib).toEqual([BUNDLED_LIBRARY_COMPONENTS_PATH]);
});

test("rewrites node:assert/strict to the bundled harness library root", () => {
	const result = withBundledHarnessLibraryComponents({
		lib: ["node:assert/strict"],
	});

	expect(result.lib).toEqual([BUNDLED_LIBRARY_COMPONENTS_PATH]);
});

test("rewrites jest to the bundled harness library root", () => {
	const result = withBundledHarnessLibraryComponents({
		lib: ["jest"],
	});

	expect(result.lib).toEqual([BUNDLED_LIBRARY_COMPONENTS_PATH]);
});

test("rewrites jasmine to the bundled harness library root", () => {
	const result = withBundledHarnessLibraryComponents({
		lib: ["jasmine"],
	});

	expect(result.lib).toEqual([BUNDLED_LIBRARY_COMPONENTS_PATH]);
});

test("rewrites mocha to the bundled harness library root", () => {
	const result = withBundledHarnessLibraryComponents({
		lib: ["mocha"],
	});

	expect(result.lib).toEqual([BUNDLED_LIBRARY_COMPONENTS_PATH]);
});

test("rewrites vitest to the bundled harness library root", () => {
	const result = withBundledHarnessLibraryComponents({
		lib: ["vitest"],
	});

	expect(result.lib).toEqual([BUNDLED_LIBRARY_COMPONENTS_PATH]);
});

test("preserves non-harness library paths when appending the bundled harness library root", () => {
	const result = withBundledHarnessLibraryComponents({
		lib: ["./custom-lib", "node:assert"],
	});

	expect(result.lib).toEqual(["./custom-lib", BUNDLED_LIBRARY_COMPONENTS_PATH]);
});

test("does not duplicate the bundled harness library root when it is already present", () => {
	const compilerOptions = {
		lib: ["node:assert", BUNDLED_LIBRARY_COMPONENTS_PATH],
	};

	const result = withBundledHarnessLibraryComponents(compilerOptions);

	expect(result.lib).toEqual([BUNDLED_LIBRARY_COMPONENTS_PATH]);
});

test("does not add the strict-equality transform when node:assert libraries are absent", () => {
	const compilerOptions = {
		lib: ["node:test"],
		transform: ["./existing-transform.js"],
	};

	const result = withBundledStrictEqualityTransform(compilerOptions);

	expect(result).toEqual(compilerOptions);
});

test("adds the bundled strict-equality transform when node:assert is requested", () => {
	const result = withBundledStrictEqualityTransform({
		lib: ["node:assert"],
	});

	expect(result.transform).toEqual([BUNDLED_STRICT_EQUALITY_TRANSFORM_PATH]);
});

test("adds the bundled strict-equality transform when node:assert/strict is requested", () => {
	const result = withBundledStrictEqualityTransform({
		lib: ["node:assert/strict"],
	});

	expect(result.transform).toEqual([BUNDLED_STRICT_EQUALITY_TRANSFORM_PATH]);
});

test("preserves existing transform paths when appending the bundled strict-equality transform", () => {
	const result = withBundledStrictEqualityTransform({
		lib: ["node:test", "node:assert"],
		transform: ["./existing-transform.js"],
	});

	expect(result.transform).toEqual([
		"./existing-transform.js",
		BUNDLED_STRICT_EQUALITY_TRANSFORM_PATH,
	]);
});

test("does not duplicate the bundled strict-equality transform when it is already present", () => {
	const compilerOptions = {
		lib: ["node:assert"],
		transform: [BUNDLED_STRICT_EQUALITY_TRANSFORM_PATH],
	};

	const result = withBundledStrictEqualityTransform(compilerOptions);

	expect(result).toEqual(compilerOptions);
});

test("does not add coverage wiring when coverage is disabled", () => {
	const compilerOptions = {
		lib: ["./custom-lib"],
		transform: ["./existing-transform.js"],
	};

	const result = withBundledCoverageTransform(compilerOptions, false);

	expect(result).toEqual(compilerOptions);
});

test("adds the bundled coverage transform and library root when coverage is enabled", () => {
	const result = withBundledCoverageTransform({}, true);

	expect(result.lib).toEqual([BUNDLED_LIBRARY_COMPONENTS_PATH]);
	expect(result.transform).toEqual([BUNDLED_COVERAGE_TRANSFORM_PATH]);
});

test("stores coverage transform options when coverage is enabled with configuration", () => {
	const result = withBundledCoverageTransform(
		{},
		{
			baseDir: "/workspace",
			include: ["src/**/*.ts"],
			exclude: ["**/*.generated.ts"],
			pointTypes: ["function", "block"],
		},
	);

	expect(result.lib).toEqual([BUNDLED_LIBRARY_COMPONENTS_PATH]);
	expect(result.transform).toEqual([BUNDLED_COVERAGE_TRANSFORM_PATH]);
	expect(
		(
			result as {
				coverageTransformOptions?: {
					baseDir?: string;
					include?: string[];
					exclude?: string[];
					pointTypes?: string[];
				};
			}
		).coverageTransformOptions,
	).toEqual({
		baseDir: "/workspace",
		include: ["src/**/*.ts"],
		exclude: ["**/*.generated.ts"],
		pointTypes: ["function", "block"],
	});
});

test("preserves existing library and transform paths when coverage is enabled", () => {
	const result = withBundledCoverageTransform(
		{
			lib: ["./custom-lib"],
			transform: ["./existing-transform.js"],
		},
		true,
	);

	expect(result.lib).toEqual(["./custom-lib", BUNDLED_LIBRARY_COMPONENTS_PATH]);
	expect(result.transform).toEqual([
		"./existing-transform.js",
		BUNDLED_COVERAGE_TRANSFORM_PATH,
	]);
});

test("preserves configured coverage options when the bundled coverage transform is already present", () => {
	const result = withBundledCoverageTransform(
		{
			transform: [BUNDLED_COVERAGE_TRANSFORM_PATH],
		},
		{
			include: ["tests/**/*.ts"],
			pointTypes: ["expression"],
		},
	);

	expect(result.transform).toEqual([BUNDLED_COVERAGE_TRANSFORM_PATH]);
	expect(
		(
			result as {
				coverageTransformOptions?: {
					include?: string[];
					pointTypes?: string[];
				};
			}
		).coverageTransformOptions,
	).toEqual({
		include: ["tests/**/*.ts"],
		pointTypes: ["expression"],
	});
});

test("bundles Windows-safe assembly paths alongside public node:* library aliases", () => {
	expect(
		bundledVirtualFiles.get(`${bundledVirtualRoot}/lib/node_assert.ts`),
	).toBe(bundledVirtualFiles.get(`${bundledVirtualRoot}/lib/node:assert.ts`));
	expect(
		bundledVirtualFiles.get(`${bundledVirtualRoot}/lib/node_test_lib.ts`),
	).toBe(bundledVirtualFiles.get(`${bundledVirtualRoot}/lib/node:test.ts`));
	expect(
		bundledVirtualFiles.has(`${bundledVirtualRoot}/lib/as-harness.ts`),
	).toBe(true);
	expect(bundledVirtualFiles.has(`${bundledVirtualRoot}/lib/jasmine.ts`)).toBe(
		true,
	);
	expect(bundledVirtualFiles.has(`${bundledVirtualRoot}/lib/jest.ts`)).toBe(
		true,
	);
	expect(bundledVirtualFiles.has(`${bundledVirtualRoot}/lib/mocha.ts`)).toBe(
		true,
	);
	expect(bundledVirtualFiles.has(`${bundledVirtualRoot}/lib/vitest.ts`)).toBe(
		true,
	);
	expect(
		bundledVirtualFiles.has(`${bundledVirtualRoot}/node_assert/index.ts`),
	).toBe(true);
	expect(
		bundledVirtualFiles.has(`${bundledVirtualRoot}/node_test/index.ts`),
	).toBe(true);
	expect(
		bundledVirtualFiles.has(`${bundledVirtualRoot}/as_harness/index.ts`),
	).toBe(true);
	expect(
		bundledVirtualFiles.has(`${bundledVirtualRoot}/jasmine/index.ts`),
	).toBe(true);
	expect(bundledVirtualFiles.has(`${bundledVirtualRoot}/jest/index.ts`)).toBe(
		true,
	);
	expect(bundledVirtualFiles.has(`${bundledVirtualRoot}/mocha/index.ts`)).toBe(
		true,
	);
	expect(bundledVirtualFiles.has(`${bundledVirtualRoot}/vitest/index.ts`)).toBe(
		true,
	);
});

test("compileEntrypoints works inside a compiled Bun executable with bundled strict-equality support", async () => {
	const tempDirectory = await mkdtemp(
		join(tmpdir(), "as-harness-compiled-asc-"),
	);
	const entryFile = join(tempDirectory, "entry.ts");
	const probeFile = join(tempDirectory, "probe.ts");
	const suiteFile = join(tempDirectory, "suite.test.ts");
	const executableFile = join(tempDirectory, "probe");
	const compileModulePath = JSON.stringify(join(import.meta.dir, "compile.ts"));

	try {
		await writeFile(
			suiteFile,
			[
				'import { test, TestContext } from "node:test";',
				"",
				'test("passes", (context: TestContext): void => {',
				'\tcontext.assert.strictEqual<i32>(1, 1, "same shape");',
				"});",
				"",
			].join("\n"),
			"utf8",
		);

		await writeFile(
			entryFile,
			[
				'export { allocateNodeIndexBuffer, discover, invoke, run } from "~/.as-harness/exports";',
				'import "./suite.test";',
				"",
			].join("\n"),
			"utf8",
		);

		await writeFile(
			probeFile,
			[
				`import { compileEntrypoints } from ${compileModulePath};`,
				'const artifacts = await compileEntrypoints(["entry.ts"], {',
				`\tbaseDir: ${JSON.stringify(tempDirectory)},`,
				'\tlib: ["node:test", "node:assert", "node:assert/strict"],',
				"});",
				'console.log(artifacts.map((artifact) => artifact.path).join(","));',
				"",
			].join("\n"),
			"utf8",
		);

		const buildProcess = Bun.spawn(
			["bun", "build", "--compile", `--outfile=${executableFile}`, probeFile],
			{
				cwd: tempDirectory,
				stderr: "pipe",
				stdout: "pipe",
			},
		);

		const [buildExitCode, buildStdout, buildStderr] = await Promise.all([
			buildProcess.exited,
			new Response(buildProcess.stdout).text(),
			new Response(buildProcess.stderr).text(),
		]);

		expect(buildExitCode).toBe(0);
		expect(buildStdout).toContain("compile");
		expect(buildStderr).toBe("");

		const runProcess = Bun.spawn([executableFile], {
			cwd: tempDirectory,
			stderr: "pipe",
			stdout: "pipe",
		});

		const [runExitCode, runStdout, runStderr] = await Promise.all([
			runProcess.exited,
			new Response(runProcess.stdout).text(),
			new Response(runProcess.stderr).text(),
		]);

		expect(runExitCode).toBe(0);
		expect(runStderr).toBe("");
		expect(runStdout.trim().split(",")).toContain("output.wasm");
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("resolves node:assert through the bundled harness library root", async () => {
	const tempLibDir = await mkdtemp(join(tmpdir(), "as-harness-lib-test-"));
	const tempEntryFile = join(tmpdir(), `as-harness-lib-test-${Date.now()}.ts`);
	const dirMap = new Map<string, string[]>();

	try {
		for (const [virtualPath, contents] of bundledVirtualFiles) {
			let currentDirectory = posix.dirname(virtualPath);
			while (currentDirectory.startsWith(bundledVirtualRoot)) {
				const entries = dirMap.get(currentDirectory) ?? [];
				if (posix.dirname(virtualPath) === currentDirectory) {
					entries.push(virtualPath);
					entries.sort();
					dirMap.set(currentDirectory, entries);
				} else if (!dirMap.has(currentDirectory)) {
					dirMap.set(currentDirectory, []);
				}

				if (currentDirectory === bundledVirtualRoot) {
					break;
				}

				currentDirectory = posix.dirname(currentDirectory);
			}

			if (
				virtualPath === BUNDLED_LIBRARY_COMPONENTS_PATH ||
				!virtualPath.startsWith(`${BUNDLED_LIBRARY_COMPONENTS_PATH}/`)
			) {
				continue;
			}

			const relativePath = posix.relative(
				BUNDLED_LIBRARY_COMPONENTS_PATH,
				virtualPath,
			);
			const outputPath = join(tempLibDir, ...relativePath.split("/"));
			await mkdir(dirname(outputPath), { recursive: true });
			await writeFile(outputPath, contents, "utf8");
		}

		await writeFile(
			tempEntryFile,
			[
				'import { deepStrictEqual } from "node:assert";',
				"export function probe(): void {",
				"\tdeepStrictEqual<i32>(1, 1);",
				"}",
				"",
			].join("\n"),
			"utf8",
		);

		const stdout = createMemoryStream();
		const stderr = createMemoryStream();
		const { error } = await runAsc(
			[
				tempEntryFile,
				"--target",
				"debug",
				"--outFile",
				"output.wasm",
				"--debug",
				"--exportStart",
				"",
				"--noColors",
				"--lib",
				tempLibDir,
			],
			{
				stdout,
				stderr,
				async readFile(filename, baseDir) {
					const normalizedFilename = filename.replaceAll("\\", "/");
					if (normalizedFilename.startsWith(bundledVirtualRoot)) {
						return (
							bundledVirtualFiles.get(posix.normalize(normalizedFilename)) ??
							null
						);
					}

					const normalizedBaseDir = baseDir.replaceAll("\\", "/");
					if (normalizedBaseDir.startsWith(bundledVirtualRoot)) {
						return (
							bundledVirtualFiles.get(
								posix.normalize(
									posix.join(normalizedBaseDir, normalizedFilename),
								),
							) ?? null
						);
					}

					try {
						return await readFileFromDisk(resolve(baseDir, filename), "utf8");
					} catch {
						return null;
					}
				},
				async listFiles(dirnameValue, baseDir) {
					const normalizedDir = dirnameValue.replaceAll("\\", "/");
					if (normalizedDir.startsWith(bundledVirtualRoot)) {
						return dirMap.get(posix.normalize(normalizedDir)) ?? null;
					}

					const normalizedBaseDir = baseDir.replaceAll("\\", "/");
					if (normalizedBaseDir.startsWith(bundledVirtualRoot)) {
						return (
							dirMap.get(
								posix.normalize(posix.join(normalizedBaseDir, normalizedDir)),
							) ?? null
						);
					}

					try {
						return (await readdir(resolve(baseDir, dirnameValue)))
							.filter(
								(entry) => entry.endsWith(".ts") && !entry.endsWith(".d.ts"),
							)
							.map((entry) => join(dirnameValue, entry));
					} catch {
						return null;
					}
				},
				writeFile() {},
			},
		);

		expect(stdout.toString()).toBe("");
		expect(stderr.toString()).toBe("");
		expect(error).toBeNull();
	} finally {
		await rm(tempLibDir, { force: true, recursive: true });
		await rm(tempEntryFile, { force: true });
	}
});

test("resolves node:test through the bundled harness library root", async () => {
	const tempLibDir = await mkdtemp(join(tmpdir(), "as-harness-lib-test-"));
	const tempEntryFile = join(tmpdir(), `as-harness-node-test-${Date.now()}.ts`);
	const dirMap = new Map<string, string[]>();

	try {
		for (const [virtualPath, contents] of bundledVirtualFiles) {
			let currentDirectory = posix.dirname(virtualPath);
			while (currentDirectory.startsWith(bundledVirtualRoot)) {
				const entries = dirMap.get(currentDirectory) ?? [];
				if (posix.dirname(virtualPath) === currentDirectory) {
					entries.push(virtualPath);
					entries.sort();
					dirMap.set(currentDirectory, entries);
				} else if (!dirMap.has(currentDirectory)) {
					dirMap.set(currentDirectory, []);
				}

				if (currentDirectory === bundledVirtualRoot) {
					break;
				}

				currentDirectory = posix.dirname(currentDirectory);
			}

			if (
				virtualPath === BUNDLED_LIBRARY_COMPONENTS_PATH ||
				!virtualPath.startsWith(`${BUNDLED_LIBRARY_COMPONENTS_PATH}/`)
			) {
				continue;
			}

			const relativePath = posix.relative(
				BUNDLED_LIBRARY_COMPONENTS_PATH,
				virtualPath,
			);
			const outputPath = join(tempLibDir, ...relativePath.split("/"));
			await mkdir(dirname(outputPath), { recursive: true });
			await writeFile(outputPath, contents, "utf8");
		}

		await writeFile(
			tempEntryFile,
			[
				'import { beforeEach, describe, SuiteContext, TestContext, test } from "node:test";',
				"function declareSuite(_context: SuiteContext): void {",
				"\tbeforeEach();",
				'\ttest.skip("nested");',
				"}",
				"function declareTest(t: TestContext): void {",
				"\tif (t.name.length < 0) unreachable();",
				"\tif (t.fullName.length < 0) unreachable();",
				"\tif (t.filePath.length < 0) unreachable();",
				"\tif (t.signal != 0) unreachable();",
				"\tif (t.passed) unreachable();",
				"\tif (t.error != 0) unreachable();",
				"\tif (t.attempt != 0) unreachable();",
				"\tif (t.workerId != 0) unreachable();",
				'\tt.diagnostic("compile diagnostic");',
				"\tt.plan(1);",
				"\tt.runOnly(true);",
				"\tt.assert.equal<i32>(1, 1);",
				'\tt.test("child");',
				"\tt.beforeEach();",
				'\tt.todo("later");',
				'\tt.skip("skip");',
				"}",
				"export function probe(): void {",
				'\ttest("top-level", declareTest);',
				'\tdescribe("suite", declareSuite);',
				"}",
				"",
			].join("\n"),
			"utf8",
		);

		const stdout = createMemoryStream();
		const stderr = createMemoryStream();
		const { error } = await runAsc(
			[
				tempEntryFile,
				"--target",
				"debug",
				"--outFile",
				"output.wasm",
				"--debug",
				"--exportStart",
				"",
				"--noColors",
				"--lib",
				tempLibDir,
			],
			{
				stdout,
				stderr,
				async readFile(filename, baseDir) {
					const normalizedFilename = filename.replaceAll("\\", "/");
					if (normalizedFilename.startsWith(bundledVirtualRoot)) {
						return (
							bundledVirtualFiles.get(posix.normalize(normalizedFilename)) ??
							null
						);
					}

					const normalizedBaseDir = baseDir.replaceAll("\\", "/");
					if (normalizedBaseDir.startsWith(bundledVirtualRoot)) {
						return (
							bundledVirtualFiles.get(
								posix.normalize(
									posix.join(normalizedBaseDir, normalizedFilename),
								),
							) ?? null
						);
					}

					try {
						return await readFileFromDisk(resolve(baseDir, filename), "utf8");
					} catch {
						return null;
					}
				},
				async listFiles(dirnameValue, baseDir) {
					const normalizedDir = dirnameValue.replaceAll("\\", "/");
					if (normalizedDir.startsWith(bundledVirtualRoot)) {
						return dirMap.get(posix.normalize(normalizedDir)) ?? null;
					}

					const normalizedBaseDir = baseDir.replaceAll("\\", "/");
					if (normalizedBaseDir.startsWith(bundledVirtualRoot)) {
						return (
							dirMap.get(
								posix.normalize(posix.join(normalizedBaseDir, normalizedDir)),
							) ?? null
						);
					}

					try {
						return (await readdir(resolve(baseDir, dirnameValue)))
							.filter(
								(entry) => entry.endsWith(".ts") && !entry.endsWith(".d.ts"),
							)
							.map((entry) => join(dirnameValue, entry));
					} catch {
						return null;
					}
				},
				writeFile() {},
			},
		);

		expect(stdout.toString()).toBe("");
		expect(stderr.toString()).toBe("");
		expect(error).toBeNull();
	} finally {
		await rm(tempLibDir, { force: true, recursive: true });
		await rm(tempEntryFile, { force: true });
	}
});

test("resolves the node:assert default export through the bundled harness library root", async () => {
	const tempLibDir = await mkdtemp(join(tmpdir(), "as-harness-lib-test-"));
	const tempEntryFile = join(
		tmpdir(),
		`as-harness-lib-default-test-${Date.now()}.ts`,
	);
	const dirMap = new Map<string, string[]>();

	try {
		for (const [virtualPath, contents] of bundledVirtualFiles) {
			let currentDirectory = posix.dirname(virtualPath);
			while (currentDirectory.startsWith(bundledVirtualRoot)) {
				const entries = dirMap.get(currentDirectory) ?? [];
				if (posix.dirname(virtualPath) === currentDirectory) {
					entries.push(virtualPath);
					entries.sort();
					dirMap.set(currentDirectory, entries);
				} else if (!dirMap.has(currentDirectory)) {
					dirMap.set(currentDirectory, []);
				}

				if (currentDirectory === bundledVirtualRoot) {
					break;
				}

				currentDirectory = posix.dirname(currentDirectory);
			}

			if (
				virtualPath === BUNDLED_LIBRARY_COMPONENTS_PATH ||
				!virtualPath.startsWith(`${BUNDLED_LIBRARY_COMPONENTS_PATH}/`)
			) {
				continue;
			}

			const relativePath = posix.relative(
				BUNDLED_LIBRARY_COMPONENTS_PATH,
				virtualPath,
			);
			const outputPath = join(tempLibDir, ...relativePath.split("/"));
			await mkdir(dirname(outputPath), { recursive: true });
			await writeFile(outputPath, contents, "utf8");
		}

		await writeFile(
			tempEntryFile,
			[
				'import assert from "node:assert";',
				"export function probe(): void {",
				"\tassert<i32>(1);",
				"}",
				"",
			].join("\n"),
			"utf8",
		);

		const stdout = createMemoryStream();
		const stderr = createMemoryStream();
		const { error } = await runAsc(
			[
				tempEntryFile,
				"--target",
				"debug",
				"--outFile",
				"output.wasm",
				"--debug",
				"--exportStart",
				"",
				"--noColors",
				"--lib",
				tempLibDir,
			],
			{
				stdout,
				stderr,
				async readFile(filename, baseDir) {
					const normalizedFilename = filename.replaceAll("\\", "/");
					if (normalizedFilename.startsWith(bundledVirtualRoot)) {
						return (
							bundledVirtualFiles.get(posix.normalize(normalizedFilename)) ??
							null
						);
					}

					const normalizedBaseDir = baseDir.replaceAll("\\", "/");
					if (normalizedBaseDir.startsWith(bundledVirtualRoot)) {
						return (
							bundledVirtualFiles.get(
								posix.normalize(
									posix.join(normalizedBaseDir, normalizedFilename),
								),
							) ?? null
						);
					}

					try {
						return await readFileFromDisk(resolve(baseDir, filename), "utf8");
					} catch {
						return null;
					}
				},
				async listFiles(dirnameValue, baseDir) {
					const normalizedDir = dirnameValue.replaceAll("\\", "/");
					if (normalizedDir.startsWith(bundledVirtualRoot)) {
						return dirMap.get(posix.normalize(normalizedDir)) ?? null;
					}

					const normalizedBaseDir = baseDir.replaceAll("\\", "/");
					if (normalizedBaseDir.startsWith(bundledVirtualRoot)) {
						return (
							dirMap.get(
								posix.normalize(posix.join(normalizedBaseDir, normalizedDir)),
							) ?? null
						);
					}

					try {
						return (await readdir(resolve(baseDir, dirnameValue)))
							.filter(
								(entry) => entry.endsWith(".ts") && !entry.endsWith(".d.ts"),
							)
							.map((entry) => join(dirnameValue, entry));
					} catch {
						return null;
					}
				},
				writeFile() {},
			},
		);

		expect(stdout.toString()).toBe("");
		expect(stderr.toString()).toBe("");
		expect(error).toBeNull();
	} finally {
		await rm(tempLibDir, { force: true, recursive: true });
		await rm(tempEntryFile, { force: true });
	}
});

test("resolves the node:assert strict namespace through the bundled harness library root", async () => {
	const tempLibDir = await mkdtemp(join(tmpdir(), "as-harness-lib-test-"));
	const tempEntryFile = join(
		tmpdir(),
		`as-harness-lib-strict-namespace-test-${Date.now()}.ts`,
	);
	const dirMap = new Map<string, string[]>();

	try {
		for (const [virtualPath, contents] of bundledVirtualFiles) {
			let currentDirectory = posix.dirname(virtualPath);
			while (currentDirectory.startsWith(bundledVirtualRoot)) {
				const entries = dirMap.get(currentDirectory) ?? [];
				if (posix.dirname(virtualPath) === currentDirectory) {
					entries.push(virtualPath);
					entries.sort();
					dirMap.set(currentDirectory, entries);
				} else if (!dirMap.has(currentDirectory)) {
					dirMap.set(currentDirectory, []);
				}

				if (currentDirectory === bundledVirtualRoot) {
					break;
				}

				currentDirectory = posix.dirname(currentDirectory);
			}

			if (
				virtualPath === BUNDLED_LIBRARY_COMPONENTS_PATH ||
				!virtualPath.startsWith(`${BUNDLED_LIBRARY_COMPONENTS_PATH}/`)
			) {
				continue;
			}

			const relativePath = posix.relative(
				BUNDLED_LIBRARY_COMPONENTS_PATH,
				virtualPath,
			);
			const outputPath = join(tempLibDir, ...relativePath.split("/"));
			await mkdir(dirname(outputPath), { recursive: true });
			await writeFile(outputPath, contents, "utf8");
		}

		await writeFile(
			tempEntryFile,
			[
				'import { strict } from "node:assert";',
				"export function probe(): void {",
				"\tstrict.equal<i32>(1, 1);",
				"}",
				"",
			].join("\n"),
			"utf8",
		);

		const stdout = createMemoryStream();
		const stderr = createMemoryStream();
		const { error } = await runAsc(
			[
				tempEntryFile,
				"--target",
				"debug",
				"--outFile",
				"output.wasm",
				"--debug",
				"--exportStart",
				"",
				"--noColors",
				"--lib",
				tempLibDir,
			],
			{
				stdout,
				stderr,
				async readFile(filename, baseDir) {
					const normalizedFilename = filename.replaceAll("\\", "/");
					if (normalizedFilename.startsWith(bundledVirtualRoot)) {
						return (
							bundledVirtualFiles.get(posix.normalize(normalizedFilename)) ??
							null
						);
					}

					const normalizedBaseDir = baseDir.replaceAll("\\", "/");
					if (normalizedBaseDir.startsWith(bundledVirtualRoot)) {
						return (
							bundledVirtualFiles.get(
								posix.normalize(
									posix.join(normalizedBaseDir, normalizedFilename),
								),
							) ?? null
						);
					}

					try {
						return await readFileFromDisk(resolve(baseDir, filename), "utf8");
					} catch {
						return null;
					}
				},
				async listFiles(dirnameValue, baseDir) {
					const normalizedDir = dirnameValue.replaceAll("\\", "/");
					if (normalizedDir.startsWith(bundledVirtualRoot)) {
						return dirMap.get(posix.normalize(normalizedDir)) ?? null;
					}

					const normalizedBaseDir = baseDir.replaceAll("\\", "/");
					if (normalizedBaseDir.startsWith(bundledVirtualRoot)) {
						return (
							dirMap.get(
								posix.normalize(posix.join(normalizedBaseDir, normalizedDir)),
							) ?? null
						);
					}

					try {
						return (await readdir(resolve(baseDir, dirnameValue)))
							.filter(
								(entry) => entry.endsWith(".ts") && !entry.endsWith(".d.ts"),
							)
							.map((entry) => join(dirnameValue, entry));
					} catch {
						return null;
					}
				},
				writeFile() {},
			},
		);

		expect(stdout.toString()).toBe("");
		expect(stderr.toString()).toBe("");
		expect(error).toBeNull();
	} finally {
		await rm(tempLibDir, { force: true, recursive: true });
		await rm(tempEntryFile, { force: true });
	}
});

test("resolves legacy node:assert equal and notEqual through the bundled harness library root", async () => {
	const tempLibDir = await mkdtemp(join(tmpdir(), "as-harness-lib-test-"));
	const tempEntryFile = join(
		tmpdir(),
		`as-harness-lib-legacy-equal-test-${Date.now()}.ts`,
	);
	const dirMap = new Map<string, string[]>();

	try {
		for (const [virtualPath, contents] of bundledVirtualFiles) {
			let currentDirectory = posix.dirname(virtualPath);
			while (currentDirectory.startsWith(bundledVirtualRoot)) {
				const entries = dirMap.get(currentDirectory) ?? [];
				if (posix.dirname(virtualPath) === currentDirectory) {
					entries.push(virtualPath);
					entries.sort();
					dirMap.set(currentDirectory, entries);
				} else if (!dirMap.has(currentDirectory)) {
					dirMap.set(currentDirectory, []);
				}

				if (currentDirectory === bundledVirtualRoot) {
					break;
				}

				currentDirectory = posix.dirname(currentDirectory);
			}

			if (
				virtualPath === BUNDLED_LIBRARY_COMPONENTS_PATH ||
				!virtualPath.startsWith(`${BUNDLED_LIBRARY_COMPONENTS_PATH}/`)
			) {
				continue;
			}

			const relativePath = posix.relative(
				BUNDLED_LIBRARY_COMPONENTS_PATH,
				virtualPath,
			);
			const outputPath = join(tempLibDir, ...relativePath.split("/"));
			await mkdir(dirname(outputPath), { recursive: true });
			await writeFile(outputPath, contents, "utf8");
		}

		await writeFile(
			tempEntryFile,
			[
				'import { equal, notEqual } from "node:assert";',
				"export function probe(): void {",
				'\tequal<i32, string>(1, "1");',
				'\tnotEqual<i32, string>(1, "2");',
				"}",
				"",
			].join("\n"),
			"utf8",
		);

		const stdout = createMemoryStream();
		const stderr = createMemoryStream();
		const { error } = await runAsc(
			[
				tempEntryFile,
				"--target",
				"debug",
				"--outFile",
				"output.wasm",
				"--debug",
				"--exportStart",
				"",
				"--noColors",
				"--lib",
				tempLibDir,
			],
			{
				stdout,
				stderr,
				async readFile(filename, baseDir) {
					const normalizedFilename = filename.replaceAll("\\", "/");
					if (normalizedFilename.startsWith(bundledVirtualRoot)) {
						return (
							bundledVirtualFiles.get(posix.normalize(normalizedFilename)) ??
							null
						);
					}

					const normalizedBaseDir = baseDir.replaceAll("\\", "/");
					if (normalizedBaseDir.startsWith(bundledVirtualRoot)) {
						return (
							bundledVirtualFiles.get(
								posix.normalize(
									posix.join(normalizedBaseDir, normalizedFilename),
								),
							) ?? null
						);
					}

					try {
						return await readFileFromDisk(resolve(baseDir, filename), "utf8");
					} catch {
						return null;
					}
				},
				async listFiles(dirnameValue, baseDir) {
					const normalizedDir = dirnameValue.replaceAll("\\", "/");
					if (normalizedDir.startsWith(bundledVirtualRoot)) {
						return dirMap.get(posix.normalize(normalizedDir)) ?? null;
					}

					const normalizedBaseDir = baseDir.replaceAll("\\", "/");
					if (normalizedBaseDir.startsWith(bundledVirtualRoot)) {
						return (
							dirMap.get(
								posix.normalize(posix.join(normalizedBaseDir, normalizedDir)),
							) ?? null
						);
					}

					try {
						return (await readdir(resolve(baseDir, dirnameValue)))
							.filter(
								(entry) => entry.endsWith(".ts") && !entry.endsWith(".d.ts"),
							)
							.map((entry) => join(dirnameValue, entry));
					} catch {
						return null;
					}
				},
				writeFile() {},
			},
		);

		expect(stdout.toString()).toBe("");
		expect(stderr.toString()).toBe("");
		expect(error).toBeNull();
	} finally {
		await rm(tempLibDir, { force: true, recursive: true });
		await rm(tempEntryFile, { force: true });
	}
});
