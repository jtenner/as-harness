import { expect, test } from "bun:test";
import {
	isAvailableWazeroAddonTarget,
	resolveCurrentWazeroAddonTarget,
	resolveWazeroAddonTargetForCompileTarget,
	WAZERO_UNAVAILABLE_TARGET,
} from "./wazero-targets";

test("resolveWazeroAddonTargetForCompileTarget maps supported build targets", () => {
	expect(resolveWazeroAddonTargetForCompileTarget("bun-darwin-arm64")).toBe(
		"darwin-arm64",
	);
	expect(
		resolveWazeroAddonTargetForCompileTarget("bun-darwin-x64-modern"),
	).toBe("darwin-x64");
	expect(resolveWazeroAddonTargetForCompileTarget("bun-linux-x64")).toBe(
		"linux-x64-gnu",
	);
	expect(resolveWazeroAddonTargetForCompileTarget("bun-linux-arm64")).toBe(
		"linux-arm64-gnu",
	);
	expect(resolveWazeroAddonTargetForCompileTarget("bun-windows-x64")).toBe(
		"windows-x64",
	);
});

test("resolveWazeroAddonTargetForCompileTarget marks unsupported or musl targets unavailable", () => {
	expect(resolveWazeroAddonTargetForCompileTarget("bun-linux-x64-musl")).toBe(
		WAZERO_UNAVAILABLE_TARGET,
	);
	expect(resolveWazeroAddonTargetForCompileTarget("unknown-target")).toBe(
		WAZERO_UNAVAILABLE_TARGET,
	);
});

test("resolveCurrentWazeroAddonTarget maps host platform and arch pairs", () => {
	expect(resolveCurrentWazeroAddonTarget("darwin", "arm64")).toBe(
		"darwin-arm64",
	);
	expect(resolveCurrentWazeroAddonTarget("darwin", "x64")).toBe("darwin-x64");
	expect(resolveCurrentWazeroAddonTarget("linux", "arm64")).toBe(
		"linux-arm64-gnu",
	);
	expect(resolveCurrentWazeroAddonTarget("linux", "x64")).toBe("linux-x64-gnu");
	expect(resolveCurrentWazeroAddonTarget("win32", "x64")).toBe("windows-x64");
	expect(resolveCurrentWazeroAddonTarget("win32", "arm64")).toBeNull();
});

test("isAvailableWazeroAddonTarget accepts only staged addon keys", () => {
	expect(isAvailableWazeroAddonTarget("linux-x64-gnu")).toBe(true);
	expect(isAvailableWazeroAddonTarget("unavailable")).toBe(false);
});
