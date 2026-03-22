import { expect, test } from "bun:test";
import {
	executableFilenameForTarget,
	releaseAssetFilenameForTarget,
} from "./build-targets";

test("releaseAssetFilenameForTarget emits target-specific archive names", () => {
	expect(releaseAssetFilenameForTarget("bun-linux-x64")).toBe(
		"as-harness-bun-linux-x64.tar.gz",
	);
	expect(releaseAssetFilenameForTarget("bun-windows-x64")).toBe(
		"as-harness-bun-windows-x64.tar.gz",
	);
});

test("executableFilenameForTarget keeps the packaged inner executable basename stable", () => {
	expect(executableFilenameForTarget("bun-linux-x64")).toBe("as-harness");
	expect(executableFilenameForTarget("bun-windows-x64")).toBe("as-harness.exe");
});
