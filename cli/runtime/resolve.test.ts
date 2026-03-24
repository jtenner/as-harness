import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";
import {
	assertSupportedRuntime,
	classifyHarnessSpecifier,
	resolveHarnessSpecifier,
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

test("assertSupportedRuntime reports resolved but still-unimplemented custom selector classes", () => {
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
		).toThrow(
			`Custom harness path selectors are not implemented yet: ./tools/custom-harness.js -> ${resolve(projectDirectory, "tools", "custom-harness.js")}`,
		);
		expect(() =>
			assertSupportedRuntime("custom-harness", projectDirectory),
		).toThrow(
			`Custom harness package selectors are not implemented yet: custom-harness -> ${join(packageDirectory, "index.cjs")}`,
		);
	} finally {
		rmSync(projectDirectory, { force: true, recursive: true });
	}
});
