import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import {
	assertSupportedRuntime,
	classifyHarnessSpecifier,
	resolveHarnessSpecifier,
	resolveRuntime,
} from "./resolve";

test("classifyHarnessSpecifier keeps built-in aliases ahead of package names", () => {
	expect(classifyHarnessSpecifier(undefined)).toEqual({
		kind: "builtin",
		value: "js",
	});
	expect(classifyHarnessSpecifier("js")).toEqual({
		kind: "builtin",
		value: "js",
	});
	expect(classifyHarnessSpecifier("wazero")).toEqual({
		kind: "builtin",
		value: "wazero",
	});
	expect(classifyHarnessSpecifier("wasmtime")).toEqual({
		kind: "builtin",
		value: "wasmtime",
	});
});

test("classifyHarnessSpecifier distinguishes relative and absolute filesystem selectors", () => {
	expect(classifyHarnessSpecifier("./tools/custom-harness.js")).toEqual({
		kind: "path",
		value: "./tools/custom-harness.js",
	});
	expect(classifyHarnessSpecifier("../tools/custom-harness.js")).toEqual({
		kind: "path",
		value: "../tools/custom-harness.js",
	});
	expect(classifyHarnessSpecifier(".\\tools\\custom-harness.js")).toEqual({
		kind: "path",
		value: ".\\tools\\custom-harness.js",
	});
	expect(classifyHarnessSpecifier("..\\tools\\custom-harness.js")).toEqual({
		kind: "path",
		value: "..\\tools\\custom-harness.js",
	});
	expect(classifyHarnessSpecifier("/tmp/custom-harness.js")).toEqual({
		kind: "path",
		value: "/tmp/custom-harness.js",
	});
	expect(classifyHarnessSpecifier("C:\\temp\\custom-harness.js")).toEqual({
		kind: "path",
		value: "C:\\temp\\custom-harness.js",
	});
	expect(
		classifyHarnessSpecifier("\\\\server\\share\\custom-harness.js"),
	).toEqual({
		kind: "path",
		value: "\\\\server\\share\\custom-harness.js",
	});
});

test("classifyHarnessSpecifier treats other non-built-in selectors as packages", () => {
	expect(classifyHarnessSpecifier("custom-harness")).toEqual({
		kind: "package",
		value: "custom-harness",
	});
	expect(classifyHarnessSpecifier("@scope/custom-harness")).toEqual({
		kind: "package",
		value: "@scope/custom-harness",
	});
});

test("resolveHarnessSpecifier resolves relative paths from the invoking project cwd", () => {
	const projectDirectory = mkdtempSync(
		join(tmpdir(), "as-harness-custom-runtime-path-"),
	);

	try {
		mkdirSync(join(projectDirectory, "tools"), { recursive: true });
		writeFileSync(
			join(projectDirectory, "tools", "custom-harness.js"),
			"module.exports = {};",
			"utf8",
		);

		expect(
			resolveHarnessSpecifier("./tools/custom-harness.js", projectDirectory),
		).toEqual({
			kind: "path",
			value: "./tools/custom-harness.js",
			resolvedPath: join(projectDirectory, "tools", "custom-harness.js"),
		});
	} finally {
		rmSync(projectDirectory, { force: true, recursive: true });
	}
});

test("resolveHarnessSpecifier keeps absolute custom harness paths intact", () => {
	const projectDirectory = mkdtempSync(
		join(tmpdir(), "as-harness-custom-runtime-absolute-"),
	);

	try {
		const absoluteHarnessPath = join(projectDirectory, "custom-harness.js");
		writeFileSync(absoluteHarnessPath, "module.exports = {};", "utf8");

		expect(
			resolveHarnessSpecifier(absoluteHarnessPath, projectDirectory),
		).toEqual({
			kind: "path",
			value: absoluteHarnessPath,
			resolvedPath: absoluteHarnessPath,
		});
	} finally {
		rmSync(projectDirectory, { force: true, recursive: true });
	}
});

test("resolveHarnessSpecifier resolves packages from the invoking project dependency graph", () => {
	const projectDirectory = mkdtempSync(
		join(tmpdir(), "as-harness-custom-runtime-package-"),
	);

	try {
		const packageDirectory = join(
			projectDirectory,
			"node_modules",
			"custom-harness",
		);
		mkdirSync(packageDirectory, { recursive: true });
		writeFileSync(
			join(packageDirectory, "package.json"),
			JSON.stringify({
				name: "custom-harness",
				main: "./index.cjs",
			}),
			"utf8",
		);
		writeFileSync(
			join(packageDirectory, "index.cjs"),
			"module.exports = {};",
			"utf8",
		);

		expect(resolveHarnessSpecifier("custom-harness", projectDirectory)).toEqual(
			{
				kind: "package",
				value: "custom-harness",
				resolvedPath: join(packageDirectory, "index.cjs"),
			},
		);
	} finally {
		rmSync(projectDirectory, { force: true, recursive: true });
	}
});

test("resolveHarnessSpecifier reports missing custom harness paths and packages against the invoking project cwd", () => {
	const projectDirectory = mkdtempSync(
		join(tmpdir(), "as-harness-custom-runtime-missing-"),
	);

	try {
		expect(() =>
			resolveHarnessSpecifier("./tools/custom-harness.js", projectDirectory),
		).toThrow(
			`Custom harness path could not be resolved from ${projectDirectory}: ./tools/custom-harness.js`,
		);
		expect(() =>
			resolveHarnessSpecifier("custom-harness", projectDirectory),
		).toThrow(
			`Custom harness package could not be resolved from ${projectDirectory}: custom-harness`,
		);
	} finally {
		rmSync(projectDirectory, { force: true, recursive: true });
	}
});

test("resolveHarnessSpecifier rejects reserved protocol selectors before package resolution", () => {
	const projectDirectory = mkdtempSync(
		join(tmpdir(), "as-harness-custom-runtime-protocol-"),
	);

	try {
		expect(() => resolveHarnessSpecifier("node:fs", projectDirectory)).toThrow(
			"Custom harness selector uses a reserved protocol and must stay local: node:fs",
		);
		expect(() =>
			resolveHarnessSpecifier("bun:sqlite", projectDirectory),
		).toThrow(
			"Custom harness selector uses a reserved protocol and must stay local: bun:sqlite",
		);
		expect(() =>
			resolveHarnessSpecifier(
				"https://example.com/harness.mjs",
				projectDirectory,
			),
		).toThrow(
			"Custom harness selector uses a reserved protocol and must stay local: https://example.com/harness.mjs",
		);
	} finally {
		rmSync(projectDirectory, { force: true, recursive: true });
	}
});

test("resolveHarnessSpecifier rejects directory targets for custom harness paths", () => {
	const projectDirectory = mkdtempSync(
		join(tmpdir(), "as-harness-custom-runtime-directory-"),
	);

	try {
		mkdirSync(join(projectDirectory, "tools"), { recursive: true });

		expect(() => resolveHarnessSpecifier("./tools", projectDirectory)).toThrow(
			"Custom harness path resolved to a directory, expected a file: ./tools",
		);
	} finally {
		rmSync(projectDirectory, { force: true, recursive: true });
	}
});

test("resolveHarnessSpecifier rejects unsupported custom harness extensions", () => {
	const projectDirectory = mkdtempSync(
		join(tmpdir(), "as-harness-custom-runtime-extension-"),
	);

	try {
		mkdirSync(join(projectDirectory, "tools"), { recursive: true });
		writeFileSync(
			join(projectDirectory, "tools", "custom-harness.txt"),
			"not a harness",
			"utf8",
		);

		expect(() =>
			resolveHarnessSpecifier("./tools/custom-harness.txt", projectDirectory),
		).toThrow(
			"Custom harness path uses an unsupported extension: ./tools/custom-harness.txt (expected .js, .cjs, .mjs, .node, or .ts)",
		);
	} finally {
		rmSync(projectDirectory, { force: true, recursive: true });
	}
});

test("assertSupportedRuntime accepts resolved custom selector classes", () => {
	const projectDirectory = mkdtempSync(
		join(tmpdir(), "as-harness-custom-runtime-assert-"),
	);

	try {
		mkdirSync(join(projectDirectory, "tools"), { recursive: true });
		writeFileSync(
			join(projectDirectory, "tools", "custom-harness.js"),
			"module.exports = {};",
			"utf8",
		);
		const packageDirectory = join(
			projectDirectory,
			"node_modules",
			"custom-harness",
		);
		mkdirSync(packageDirectory, { recursive: true });
		writeFileSync(
			join(packageDirectory, "package.json"),
			JSON.stringify({
				name: "custom-harness",
				main: "./index.cjs",
			}),
			"utf8",
		);
		writeFileSync(
			join(packageDirectory, "index.cjs"),
			"module.exports = {};",
			"utf8",
		);

		expect(() =>
			assertSupportedRuntime("./tools/custom-harness.js", projectDirectory),
		).not.toThrow();
		expect(() =>
			assertSupportedRuntime("custom-harness", projectDirectory),
		).not.toThrow();
	} finally {
		rmSync(projectDirectory, { force: true, recursive: true });
	}
});

test("resolveRuntime normalizes a default-export runtime object", async () => {
	const projectDirectory = mkdtempSync(
		join(tmpdir(), "as-harness-custom-runtime-default-"),
	);

	try {
		mkdirSync(join(projectDirectory, "tools"), { recursive: true });
		writeFileSync(
			join(projectDirectory, "tools", "custom-runtime.mjs"),
			[
				"export default {",
				'  name: "custom-default-runtime",',
				"  createHarness() {",
				"    return {",
				"      start: async () => ({ metadata: { ok: true, discoveryOk: true, planningOk: true, discoveredTestCount: 0, topLevelNodes: [], workerCount: 1, planIssues: [], blocked: [], coverage: null }, ok: true, discoveryOk: true, planningOk: true, discoveredTestCount: 0, topLevelNodes: [], workerCount: 1, branches: [], planIssues: [], blocked: [], coverage: null }),",
				"      close() {},",
				"    };",
				"  },",
				"};",
			].join("\n"),
			"utf8",
		);

		const runtime = await resolveRuntime(
			"./tools/custom-runtime.mjs",
			projectDirectory,
		);

		expect(runtime.name).toBe("custom-default-runtime");
		expect(typeof runtime.createHarness).toBe("function");
		expect(typeof runtime.mutateCompilerArguments).toBe("function");
	} finally {
		rmSync(projectDirectory, { force: true, recursive: true });
	}
});

test("resolveRuntime normalizes a named runtime export object", async () => {
	const projectDirectory = mkdtempSync(
		join(tmpdir(), "as-harness-custom-runtime-named-"),
	);

	try {
		const packageDirectory = join(
			projectDirectory,
			"node_modules",
			"custom-runtime",
		);
		mkdirSync(packageDirectory, { recursive: true });
		writeFileSync(
			join(packageDirectory, "package.json"),
			JSON.stringify({
				name: "custom-runtime",
				main: "./index.cjs",
			}),
			"utf8",
		);
		writeFileSync(
			join(packageDirectory, "index.cjs"),
			[
				"exports.runtime = {",
				'  name: "custom-package-runtime",',
				"  createHarness() {",
				"    return {",
				"      start: async () => ({ metadata: { ok: true, discoveryOk: true, planningOk: true, discoveredTestCount: 0, topLevelNodes: [], workerCount: 1, planIssues: [], blocked: [], coverage: null }, ok: true, discoveryOk: true, planningOk: true, discoveredTestCount: 0, topLevelNodes: [], workerCount: 1, branches: [], planIssues: [], blocked: [], coverage: null }),",
				"      close() {},",
				"    };",
				"  },",
				"};",
			].join("\n"),
			"utf8",
		);

		const runtime = await resolveRuntime("custom-runtime", projectDirectory);

		expect(runtime.name).toBe("custom-package-runtime");
		expect(typeof runtime.createHarness).toBe("function");
		expect(typeof runtime.mutateCompilerArguments).toBe("function");
	} finally {
		rmSync(projectDirectory, { force: true, recursive: true });
	}
});

test("resolveRuntime normalizes a direct createHarness namespace export and derives the runtime name", async () => {
	const projectDirectory = mkdtempSync(
		join(tmpdir(), "as-harness-custom-runtime-direct-"),
	);

	try {
		mkdirSync(join(projectDirectory, "tools"), { recursive: true });
		writeFileSync(
			join(projectDirectory, "tools", "derived-runtime.mjs"),
			[
				"export function createHarness() {",
				"  return {",
				"    start: async () => ({ metadata: { ok: true, discoveryOk: true, planningOk: true, discoveredTestCount: 0, topLevelNodes: [], workerCount: 1, planIssues: [], blocked: [], coverage: null }, ok: true, discoveryOk: true, planningOk: true, discoveredTestCount: 0, topLevelNodes: [], workerCount: 1, branches: [], planIssues: [], blocked: [], coverage: null }),",
				"    close() {},",
				"  };",
				"}",
			].join("\n"),
			"utf8",
		);

		const runtime = await resolveRuntime(
			"./tools/derived-runtime.mjs",
			projectDirectory,
		);

		expect(runtime.name).toBe("derived-runtime");
		expect(typeof runtime.createHarness).toBe("function");
		expect(typeof runtime.mutateCompilerArguments).toBe("function");
	} finally {
		rmSync(projectDirectory, { force: true, recursive: true });
	}
});

test("resolveRuntime rejects custom modules without a createHarness export", async () => {
	const projectDirectory = mkdtempSync(
		join(tmpdir(), "as-harness-custom-runtime-invalid-"),
	);

	try {
		mkdirSync(join(projectDirectory, "tools"), { recursive: true });
		writeFileSync(
			join(projectDirectory, "tools", "invalid-runtime.mjs"),
			"export const notAHarness = true;\n",
			"utf8",
		);

		await expect(
			resolveRuntime("./tools/invalid-runtime.mjs", projectDirectory),
		).rejects.toThrow(
			"Custom harness module could not be loaded: ./tools/invalid-runtime.mjs. Custom harness module did not expose a valid createHarness(...) export: ./tools/invalid-runtime.mjs",
		);
	} finally {
		rmSync(projectDirectory, { force: true, recursive: true });
	}
});
