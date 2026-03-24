import { expect, test } from "bun:test";
import { assertSupportedRuntime, classifyHarnessSpecifier } from "./resolve";

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

test("assertSupportedRuntime reports recognized but unimplemented custom selector classes", () => {
	expect(() => assertSupportedRuntime("./tools/custom-harness.js")).toThrow(
		"Custom harness path selectors are not implemented yet: ./tools/custom-harness.js",
	);
	expect(() => assertSupportedRuntime("custom-harness")).toThrow(
		"Custom harness package selectors are not implemented yet: custom-harness",
	);
});
