import { expect, test } from "bun:test";
import { parseCommand } from "./index";

test("parseCommand captures run harness selection and compiler options", () => {
	const parsed = parseCommand([
		"run",
		"--coverage",
		"--update-snapshots",
		"--coverage-format",
		"json",
		"--coverage-include",
		"src/**/*.ts",
		"--coverage-exclude=**/*.generated.ts",
		"--coverage-point-type",
		"function",
		"--coverage-point-type=block",
		"--harness",
		"wazero",
		"--sourceMap",
		"--runtime",
		"minimal",
		"--enable",
		"simd",
		"--disableWarning",
		"232",
		"--lib",
		"custom-lib",
		"--path=vendor",
		"tests/example.test.ts",
	]);

	expect(parsed.command).toBe("run");
	expect(parsed.coverage).toBe(true);
	expect(parsed.updateSnapshots).toBe(true);
	expect(parsed.coverageFormat).toBe("json");
	expect(parsed.coverageInclude).toEqual(["src/**/*.ts"]);
	expect(parsed.coverageExclude).toEqual(["**/*.generated.ts"]);
	expect(parsed.coveragePointTypes).toEqual(["function", "block"]);
	expect(parsed.harness).toBe("wazero");
	expect(parsed.ordinals).toEqual(["tests/example.test.ts"]);
	expect(parsed.compilerOptions.sourceMap).toBe(true);
	expect(parsed.compilerOptions.runtime).toBe("minimal");
	expect(parsed.compilerOptions.enable).toEqual(["simd"]);
	expect(parsed.compilerOptions.disableWarning).toEqual([232]);
	expect(parsed.compilerOptions.lib).toEqual(["custom-lib"]);
	expect(parsed.compilerOptions.path).toEqual(["vendor"]);
});

test("parseCommand rejects unsupported coverage point types", () => {
	expect(() =>
		parseCommand(["run", "--coverage-point-type", "line", "suite.test.ts"]),
	).toThrow(
		"Invalid value for --coverage-point-type: line. Expected function, block, or expression.",
	);
});

test("parseCommand keeps disableWarning without a code as a boolean", () => {
	const parsed = parseCommand(["run", "--disableWarning", "suite.test.ts"]);

	expect(parsed.command).toBe("run");
	expect(parsed.ordinals).toEqual(["suite.test.ts"]);
	expect(parsed.compilerOptions.disableWarning).toBe(true);
});

test("parseCommand does not allow run-only compiler flags on list", () => {
	expect(() => parseCommand(["list", "--sourceMap"])).toThrow(
		"Unknown option: --sourceMap",
	);
});
