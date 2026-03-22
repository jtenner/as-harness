import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";

const require = createRequire(import.meta.url);
const sourceWorkerModule = require("./wazero-source-worker.cjs") as {
	__test: {
		copyAddonToPrivateTempDirectory(
			addonPath: string,
			tempRoot?: string,
		): { addonDirectory: string; addonPath: string };
		shouldIsolateSourceAddonLoad(
			platform?: string,
			bunVersion?: string | undefined,
		): boolean;
		sourceAddonPath: string;
	};
};

test("shouldIsolateSourceAddonLoad only enables source addon staging for Bun on Windows", () => {
	expect(
		sourceWorkerModule.__test.shouldIsolateSourceAddonLoad("win32", "1.3.11"),
	).toBe(true);
	expect(
		sourceWorkerModule.__test.shouldIsolateSourceAddonLoad("linux", "1.3.11"),
	).toBe(false);
	expect(
		sourceWorkerModule.__test.shouldIsolateSourceAddonLoad("win32", ""),
	).toBe(false);
	expect(
		sourceWorkerModule.__test.shouldIsolateSourceAddonLoad("darwin", ""),
	).toBe(false);
});

test("copyAddonToPrivateTempDirectory stages a private wazero.node copy", () => {
	const tempRoot = mkdtempSync(
		join(tmpdir(), "as-harness-wazero-source-test-"),
	);

	try {
		const sourceAddonPath = join(tempRoot, "source.node");
		writeFileSync(sourceAddonPath, "source-addon", "utf8");

		const staged = sourceWorkerModule.__test.copyAddonToPrivateTempDirectory(
			sourceAddonPath,
			tempRoot,
		);

		expect(staged.addonDirectory).not.toBe(tempRoot);
		expect(staged.addonPath).toBe(join(staged.addonDirectory, "wazero.node"));
		expect(existsSync(staged.addonPath)).toBe(true);
		expect(readFileSync(staged.addonPath, "utf8")).toBe("source-addon");

		rmSync(staged.addonDirectory, { force: true, recursive: true });
	} finally {
		rmSync(tempRoot, { force: true, recursive: true });
	}
});
