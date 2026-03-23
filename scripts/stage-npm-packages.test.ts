import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	SUPPORTED_NATIVE_TARGETS,
	stageNativeBinaryPackage,
	stageNpmPackages,
} from "./stage-npm-packages";

const stagedDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		stagedDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true })),
	);
});

test("stageNpmPackages writes staged shared and js package payloads with package-safe shared imports", async () => {
	const outputDir = await mkdtemp(join(tmpdir(), "as-harness-npm-stage-"));
	stagedDirectories.push(outputDir);

	const stagedPackages = await stageNpmPackages(outputDir);
	const stagedPackageNames = stagedPackages.map(({ name }) => name).sort();
	expect(stagedPackageNames).toEqual(
		expect.arrayContaining([
			"@as-harness/cli",
			"@as-harness/js",
			"@as-harness/shared",
			"@as-harness/wazero",
			"@as-harness/wasmtime",
		]),
	);

	const stagedCliDir = join(outputDir, "@as-harness", "cli");
	const stagedJsDir = join(outputDir, "@as-harness", "js");
	const stagedSharedDir = join(outputDir, "@as-harness", "shared");
	const stagedWazeroDir = join(outputDir, "@as-harness", "wazero");
	const stagedWasmtimeDir = join(outputDir, "@as-harness", "wasmtime");
	const cliBinDirectory = join(stagedCliDir, "bin");
	const cliBinFilenames = (await readdir(cliBinDirectory)).sort();
	const [
		cliBundleText,
		cliPackageJsonText,
		jsIndexCjs,
		jsIndexDts,
		jsPackageJsonText,
		sharedPackageJsonText,
		wazeroIndexCjs,
		wazeroPackageJsonText,
		wasmtimePackageJsonText,
	] = await Promise.all([
		readFile(join(cliBinDirectory, "as-harness.mjs"), "utf8"),
		readFile(join(stagedCliDir, "package.json"), "utf8"),
		readFile(join(stagedJsDir, "index.cjs"), "utf8"),
		readFile(join(stagedJsDir, "index.d.ts"), "utf8"),
		readFile(join(stagedJsDir, "package.json"), "utf8"),
		readFile(join(stagedSharedDir, "package.json"), "utf8"),
		readFile(join(stagedWazeroDir, "index.cjs"), "utf8"),
		readFile(join(stagedWazeroDir, "package.json"), "utf8"),
		readFile(join(stagedWasmtimeDir, "package.json"), "utf8"),
	]);
	const cliBinContents = await Promise.all(
		cliBinFilenames.map((filename) =>
			readFile(join(cliBinDirectory, filename), "utf8"),
		),
	);
	const combinedCliBundleText = cliBinContents.join("\n");

	expect(jsIndexCjs).toContain('require("@as-harness/shared/covers")');
	expect(jsIndexCjs).toContain('require("@as-harness/shared/start")');
	expect(jsIndexCjs).toContain('require("@as-harness/shared/snapshots")');
	expect(jsIndexDts).toContain("@as-harness/shared/harness-types");
	expect(cliBundleText.startsWith("#!/usr/bin/env node")).toBe(true);
	expect(cliBinFilenames).toContain("as-harness.mjs");
	expect(
		cliBinFilenames.some((filename) => filename !== "as-harness.mjs"),
	).toBe(true);
	expect(combinedCliBundleText).toContain("@as-harness/wazero");
	expect(combinedCliBundleText).toContain("@as-harness/wasmtime");
	expect(combinedCliBundleText).toContain("npmPackageMode = true");
	expect(wazeroIndexCjs).toContain("function loadNativeAddon()");
	expect(wazeroIndexCjs).toContain("@as-harness/wazero-linux-x64-gnu");
	expect(wazeroIndexCjs).not.toContain('require("./dist/wazero.node")');

	const cliPackageJson = JSON.parse(cliPackageJsonText) as {
		bin: Record<string, string>;
		dependencies: Record<string, string>;
		name: string;
		optionalDependencies: Record<string, string>;
		peerDependencies: Record<string, string>;
	};
	const jsPackageJson = JSON.parse(jsPackageJsonText) as {
		dependencies: Record<string, string>;
		name: string;
	};
	const sharedPackageJson = JSON.parse(sharedPackageJsonText) as {
		exports: Record<string, string>;
		name: string;
	};
	const wazeroPackageJson = JSON.parse(wazeroPackageJsonText) as {
		name: string;
		optionalDependencies: Record<string, string>;
	};
	const wasmtimePackageJson = JSON.parse(wasmtimePackageJsonText) as {
		name: string;
		optionalDependencies: Record<string, string>;
	};

	expect(cliPackageJson.name).toBe("@as-harness/cli");
	expect(cliPackageJson.bin["as-harness"]).toBe("./bin/as-harness.mjs");
	expect(cliPackageJson.dependencies["@as-harness/js"]).toMatch(/^0\./);
	expect(cliPackageJson.peerDependencies.assemblyscript).toMatch(/^\^0\./);
	expect(cliPackageJson.optionalDependencies).toHaveProperty(
		"@as-harness/wazero",
	);
	expect(jsPackageJson.name).toBe("@as-harness/js");
	expect(jsPackageJson.dependencies["@as-harness/shared"]).toMatch(/^0\./);
	expect(sharedPackageJson.name).toBe("@as-harness/shared");
	expect(sharedPackageJson.exports["./start"]).toBe("./start.cjs");
	expect(wazeroPackageJson.name).toBe("@as-harness/wazero");
	expect(wazeroPackageJson.optionalDependencies).toHaveProperty(
		"@as-harness/wazero-linux-x64-gnu",
	);
	expect(wasmtimePackageJson.name).toBe("@as-harness/wasmtime");
	expect(wasmtimePackageJson.optionalDependencies).toHaveProperty(
		"@as-harness/wasmtime-win32-x64-msvc",
	);
});

test("stageNativeBinaryPackage writes platform package metadata around a provided native artifact", async () => {
	const outputDir = await mkdtemp(join(tmpdir(), "as-harness-native-stage-"));
	stagedDirectories.push(outputDir);

	const fakeBinaryPath = join(outputDir, "fake-wazero.node");
	await writeFile(fakeBinaryPath, "fake-native-binary", "utf8");

	const target =
		SUPPORTED_NATIVE_TARGETS.find(
			(candidate) => candidate.packageSuffix === "linux-x64-gnu",
		) ?? SUPPORTED_NATIVE_TARGETS[0];
	const stagedPackage = await stageNativeBinaryPackage(
		outputDir,
		"wazero",
		target,
		fakeBinaryPath,
	);
	const stagedPackageJson = JSON.parse(
		await readFile(join(stagedPackage.directory, "package.json"), "utf8"),
	) as {
		cpu: string[];
		libc?: string[];
		main: string;
		name: string;
		os: string[];
	};

	expect(stagedPackage.name).toBe(`@as-harness/wazero-${target.packageSuffix}`);
	expect(stagedPackageJson.name).toBe(
		`@as-harness/wazero-${target.packageSuffix}`,
	);
	expect(stagedPackageJson.main).toBe("./wazero.node");
	expect(stagedPackageJson.os).toEqual([target.os]);
	expect(stagedPackageJson.cpu).toEqual([target.cpu]);
	if (target.libc) {
		expect(stagedPackageJson.libc).toEqual([target.libc]);
	}
});
