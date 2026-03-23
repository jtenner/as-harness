#!/usr/bin/env bun

import { existsSync } from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dir, "..");
const cliDir = path.join(rootDir, "cli");

const biomeExtensions = new Set([".ts", ".js", ".cjs", ".mjs", ".json"]);
const biomeRoots = ["assembly/", "cli/", "harness/", "scripts/"];
const biomeExcludedPaths = new Set([
	"assembly/package-lock.json",
	"assembly/assembly/internal/imports.ts",
	"assembly/assembly/lib/as_covers.ts",
	"cli/as/.generated/virtual-files.barrel.ts",
]);
const biomeExcludedSegments = [
	"/.cache/",
	"/build/",
	"/dist/",
	"/node_modules/",
	"/target/",
];

function commandLabel(command: string[]): string {
	return command.join(" ");
}

async function runCommand(
	command: string[],
	options: {
		cwd?: string;
		captureStdout?: boolean;
	} = {},
): Promise<string> {
	const process = Bun.spawn(command, {
		cwd: options.cwd ?? rootDir,
		stdout: options.captureStdout ? "pipe" : "inherit",
		stderr: "inherit",
	});
	const stdout = options.captureStdout
		? await new Response(process.stdout).text()
		: "";
	const exitCode = await process.exited;

	if (exitCode !== 0) {
		throw new Error(
			`Command failed with exit code ${exitCode}: ${commandLabel(command)}`,
		);
	}

	return stdout;
}

async function gitFileList(args: string[]): Promise<string[]> {
	const stdout = await runCommand(["git", ...args], {
		cwd: rootDir,
		captureStdout: true,
	});

	return stdout
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

function shouldFormatWithBiome(filePath: string): boolean {
	if (biomeExcludedPaths.has(filePath)) {
		return false;
	}

	if (!biomeRoots.some((prefix) => filePath.startsWith(prefix))) {
		return filePath === "package.json";
	}

	if (biomeExcludedSegments.some((segment) => filePath.includes(segment))) {
		return false;
	}

	return biomeExtensions.has(path.extname(filePath));
}

function toCliBiomePath(filePath: string): string {
	if (filePath.startsWith("cli/")) {
		return `./${filePath.slice("cli/".length)}`;
	}

	return `../${filePath}`;
}

async function listRepoFiles(): Promise<string[]> {
	const [trackedFiles, untrackedFiles] = await Promise.all([
		gitFileList(["ls-files"]),
		gitFileList(["ls-files", "--others", "--exclude-standard"]),
	]);

	return [...new Set([...trackedFiles, ...untrackedFiles])].sort();
}

const checkMode = Bun.argv.includes("--check");
const allRepoFiles = await listRepoFiles();
const existingRepoFiles = allRepoFiles.filter((filePath) =>
	existsSync(path.join(rootDir, filePath)),
);
const biomeFiles = existingRepoFiles
	.filter(shouldFormatWithBiome)
	.map(toCliBiomePath);
const goFiles = existingRepoFiles
	.filter((filePath) => filePath.endsWith(".go"))
	.map((filePath) => path.join(rootDir, filePath));

if (biomeFiles.length > 0) {
	console.log(
		checkMode
			? "Checking JS/TS/JSON source formatting with Biome..."
			: "Formatting JS/TS/JSON source files with Biome...",
	);

	await runCommand(
		[
			process.execPath,
			"x",
			"biome",
			"format",
			...(checkMode ? [] : ["--write"]),
			...biomeFiles,
		],
		{ cwd: cliDir },
	);

	console.log("Biome source formatting completed.");
}

if (goFiles.length > 0) {
	console.log(
		checkMode
			? "Checking Go source formatting with gofmt..."
			: "Formatting Go source files with gofmt...",
	);

	if (checkMode) {
		const diff = await runCommand(["gofmt", "-d", ...goFiles], {
			cwd: rootDir,
			captureStdout: true,
		});

		if (diff.trim().length > 0) {
			process.stdout.write(diff);
			throw new Error("Go source files are not gofmt-formatted.");
		}
	} else {
		await runCommand(["gofmt", "-w", ...goFiles], { cwd: rootDir });
	}

	console.log("Go source formatting completed.");
}

console.log(
	checkMode
		? "Checking Rust source formatting with cargo fmt..."
		: "Formatting Rust source files with cargo fmt...",
);

await runCommand(
	[
		"cargo",
		"fmt",
		...(checkMode ? ["--check"] : []),
		"--manifest-path",
		path.join(rootDir, "harness/wasmtime/Cargo.toml"),
	],
	{ cwd: rootDir },
);

console.log(
	checkMode
		? "All formatting checks passed."
		: "All source formatting completed.",
);
