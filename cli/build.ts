#!/usr/bin/env bun

import { copyFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { generateBundledVirtualFiles } from "./as/generate-virtual-files";
import {
	isAvailableWazeroAddonTarget,
	resolveCurrentWazeroAddonTarget,
	resolveWazeroAddonTargetForCompileTarget,
	wazeroAddonPathFromCliDir,
} from "./runtime/wazero-targets";

const CLI_DIR = import.meta.dir;
const REPO_DIR = join(CLI_DIR, "..");
const EXECUTABLE_NAME = "as-harness";
const ENTRYPOINT = join(CLI_DIR, "index.ts");
const DIST_DIR = join(CLI_DIR, "dist");
const LOCAL_WAZERO_ADDON_PATH = join(
	REPO_DIR,
	"harness",
	"wazero",
	"dist",
	"wazero.node",
);

// Bun's compile-target grammar accepts more strings than the executable docs
// currently list. This matrix sticks to the documented supported targets and
// the explicit x64 SIMD variants Bun accepts for those targets.
const COMPILE_TARGETS: Bun.Build.CompileTarget[] = [
	"bun-darwin-x64",
	"bun-darwin-x64-baseline",
	"bun-darwin-x64-modern",
	"bun-darwin-arm64",
	"bun-linux-x64",
	"bun-linux-x64-baseline",
	"bun-linux-x64-modern",
	"bun-linux-arm64",
	"bun-linux-x64-musl",
	"bun-linux-x64-baseline-musl",
	"bun-linux-x64-modern-musl",
	"bun-linux-arm64-musl",
	"bun-windows-x64",
	"bun-windows-x64-baseline",
	"bun-windows-x64-modern",
];

function printTargets() {
	for (const target of COMPILE_TARGETS) {
		console.log(target);
	}
}

async function cleanDist() {
	await rm(DIST_DIR, { recursive: true, force: true });
}

function resolveTargets(args: string[]) {
	if (args.includes("--list-targets")) {
		printTargets();
		process.exit(0);
	}

	if (args.includes("--clean")) {
		return { cleanOnly: true, targets: [] as Bun.Build.CompileTarget[] };
	}

	if (args.length === 0) {
		return { cleanOnly: false, targets: COMPILE_TARGETS };
	}

	const validTargets = new Set(COMPILE_TARGETS);
	const invalidTargets = args.filter(
		(target) => !validTargets.has(target as Bun.Build.CompileTarget),
	);

	if (invalidTargets.length > 0) {
		console.error(`Unknown compile target(s): ${invalidTargets.join(", ")}`);
		console.error(
			"Run 'bun run build:list-targets' to see the supported target list.",
		);
		process.exit(1);
	}

	return { cleanOnly: false, targets: args as Bun.Build.CompileTarget[] };
}

function outputPathForTarget(target: Bun.Build.CompileTarget) {
	const extension = target.startsWith("bun-windows-") ? ".exe" : "";
	return join(DIST_DIR, target, `${EXECUTABLE_NAME}${extension}`);
}

async function buildTarget(
	target: Bun.Build.CompileTarget,
	wazeroTarget: string,
	index: number,
	total: number,
) {
	const outfile = outputPathForTarget(target);
	await mkdir(dirname(outfile), { recursive: true });

	console.log(`[${index}/${total}] building ${target}`);

	const processHandle = Bun.spawn(
		[
			process.execPath,
			"build",
			"--compile",
			`--target=${target}`,
			`--outfile=${outfile}`,
			`--define=WAZERO_TARGET="${wazeroTarget}"`,
			ENTRYPOINT,
		],
		{
			cwd: CLI_DIR,
			stdout: "inherit",
			stderr: "inherit",
			stdin: "inherit",
		},
	);

	const exitCode = await processHandle.exited;
	return { exitCode, outfile, target };
}

async function ensureLocalWazeroAddonBuilt() {
	if (existsSync(LOCAL_WAZERO_ADDON_PATH)) {
		return;
	}

	console.log("building local wazero addon for CLI packaging");

	const processHandle = Bun.spawn([process.execPath, "./scripts/build.mjs"], {
		cwd: join(REPO_DIR, "harness", "wazero"),
		stderr: "inherit",
		stdin: "inherit",
		stdout: "inherit",
	});

	const exitCode = await processHandle.exited;
	if (exitCode !== 0) {
		throw new Error("Failed to build the local wazero addon.");
	}
}

async function prepareWazeroAddonForTarget(target: Bun.Build.CompileTarget) {
	const wazeroTarget = resolveWazeroAddonTargetForCompileTarget(target);
	if (!isAvailableWazeroAddonTarget(wazeroTarget)) {
		return wazeroTarget;
	}

	const outputPath = wazeroAddonPathFromCliDir(CLI_DIR, wazeroTarget);
	if (existsSync(outputPath)) {
		return wazeroTarget;
	}

	if (resolveCurrentWazeroAddonTarget() !== wazeroTarget) {
		console.warn(
			`wazero addon for ${target} is not staged at ${outputPath}; building this CLI target without bundled wazero support.`,
		);
		return "unavailable";
	}

	await ensureLocalWazeroAddonBuilt();
	await mkdir(dirname(outputPath), { recursive: true });
	await copyFile(LOCAL_WAZERO_ADDON_PATH, outputPath);
	return wazeroTarget;
}

async function main() {
	const { cleanOnly, targets } = resolveTargets(process.argv.slice(2));
	const failures: Bun.Build.CompileTarget[] = [];

	await cleanDist();

	if (cleanOnly) {
		console.log(`Removed ${DIST_DIR}/`);
		return;
	}

	await generateBundledVirtualFiles();

	for (const [index, target] of targets.entries()) {
		const wazeroTarget = await prepareWazeroAddonForTarget(target);
		const result = await buildTarget(
			target,
			wazeroTarget,
			index + 1,
			targets.length,
		);
		if (wazeroTarget !== "unavailable") {
			console.log(`bundled wazero addon target for ${target}: ${wazeroTarget}`);
		}

		if (result.exitCode !== 0) {
			failures.push(target);
		}
	}

	if (failures.length > 0) {
		console.error("");
		console.error(`Failed targets (${failures.length}/${targets.length}):`);
		for (const target of failures) {
			console.error(`- ${target}`);
		}
		process.exit(1);
	}

	console.log("");
	console.log(`Built ${targets.length} executable target(s) into ${DIST_DIR}/`);
}

await main();
