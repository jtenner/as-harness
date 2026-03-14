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
	BUNDLED_LIBRARY_COMPONENTS_PATH,
	BUNDLED_STRICT_EQUALITY_TRANSFORM_PATH,
	withBundledHarnessLibraryComponents,
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

test("rewrites node:assert/strict to the bundled harness library root", () => {
	const result = withBundledHarnessLibraryComponents({
		lib: ["node:assert/strict"],
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
				"\tt.assert.equal<i32>(1, 1);",
				'\tt.test("child");',
				"\tt.beforeEach();",
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
