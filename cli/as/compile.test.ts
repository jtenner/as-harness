import { expect, test } from "bun:test";
import {
	BUNDLED_STRICT_EQUALITY_TRANSFORM_PATH,
	withBundledStrictEqualityTransform,
} from "./compile";

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
