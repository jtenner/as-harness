#!/usr/bin/env bun

import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { stageNpmPackages } from "./stage-npm-packages";

const REPO_DIR = join(import.meta.dir, "..");
const DEFAULT_OUTPUT_DIR = join(REPO_DIR, "dist", "npm");
const DEFAULT_ARTIFACT_DIR = join(REPO_DIR, "dist", "npm-release-artifacts");

type ParsedArguments = {
	artifactDir: string;
	outputDir: string;
	selection: "all" | "common" | "native";
};

type PackedPackage = {
	directory: string;
	filename: string;
	name: string;
	tarballPath: string;
	version: string;
};

function parseArguments(argv: string[]): ParsedArguments {
	let artifactDir = DEFAULT_ARTIFACT_DIR;
	let outputDir = DEFAULT_OUTPUT_DIR;
	let selection: ParsedArguments["selection"] = "all";

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];

		if (argument === "--artifact-dir") {
			artifactDir = argv[index + 1] ?? artifactDir;
			index += 1;
			continue;
		}

		if (argument === "--output-dir") {
			outputDir = argv[index + 1] ?? outputDir;
			index += 1;
			continue;
		}

		if (argument === "--selection") {
			const value = argv[index + 1];
			if (value === "all" || value === "common" || value === "native") {
				selection = value;
				index += 1;
				continue;
			}

			throw new Error(`Unknown --selection value: ${value}`);
		}

		throw new Error(`Unknown argument: ${argument}`);
	}

	return { artifactDir, outputDir, selection };
}

function npmExecutable() {
	return process.platform === "win32" ? "npm.cmd" : "npm";
}

function isNativeBinaryPackage(packageName: string) {
	return (
		packageName.startsWith("@as-harness/wazero-") ||
		packageName.startsWith("@as-harness/wasmtime-")
	);
}

function shouldIncludePackage(
	packageName: string,
	selection: ParsedArguments["selection"],
) {
	if (selection === "all") {
		return true;
	}

	const nativeBinaryPackage = isNativeBinaryPackage(packageName);
	if (selection === "native") {
		return nativeBinaryPackage;
	}

	return !nativeBinaryPackage;
}

async function runCommand(command: string[], cwd: string) {
	const processHandle = Bun.spawn(command, {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(processHandle.stdout).text(),
		new Response(processHandle.stderr).text(),
		processHandle.exited,
	]);

	if (exitCode !== 0) {
		throw new Error(
			[
				`${command.join(" ")} failed in ${cwd} with exit code ${exitCode}.`,
				stdout,
				stderr,
			]
				.filter(Boolean)
				.join("\n\n"),
		);
	}

	return stdout;
}

async function readPackageVersion(directory: string) {
	const packageJson = JSON.parse(
		await readFile(join(directory, "package.json"), "utf8"),
	) as { version?: string };
	if (
		typeof packageJson.version !== "string" ||
		packageJson.version.length === 0
	) {
		throw new Error(
			`Missing package version in ${join(directory, "package.json")}.`,
		);
	}

	return packageJson.version;
}

async function packPackage(directory: string): Promise<PackedPackage> {
	const stdout = await runCommand(
		[npmExecutable(), "pack", "--json"],
		directory,
	);
	const parsed = JSON.parse(stdout) as Array<{
		filename?: string;
		name?: string;
	}>;
	const entry = parsed[0];
	if (!entry?.filename || !entry.name) {
		throw new Error(
			`npm pack in ${directory} did not return package metadata.`,
		);
	}

	return {
		directory,
		filename: entry.filename,
		name: entry.name,
		tarballPath: resolve(directory, entry.filename),
		version: await readPackageVersion(directory),
	};
}

async function main() {
	const { artifactDir, outputDir, selection } = parseArguments(
		process.argv.slice(2),
	);
	const stagedPackages = await stageNpmPackages(outputDir);
	const selectedPackages = stagedPackages.filter((stagedPackage) =>
		shouldIncludePackage(stagedPackage.name, selection),
	);
	const packedPackages = await Promise.all(
		selectedPackages.map((stagedPackage) =>
			packPackage(stagedPackage.directory),
		),
	);

	await mkdir(artifactDir, { recursive: true });
	for (const packedPackage of packedPackages) {
		await cp(
			packedPackage.tarballPath,
			join(artifactDir, packedPackage.filename),
		);
	}

	const manifestPath = join(artifactDir, "npm-package-artifacts.json");
	await mkdir(dirname(manifestPath), { recursive: true });
	await writeFile(
		manifestPath,
		`${JSON.stringify(
			{
				generatedAt: new Date().toISOString(),
				selection,
				packages: packedPackages.map((packedPackage) => ({
					filename: packedPackage.filename,
					name: packedPackage.name,
					tarballPath: join(artifactDir, packedPackage.filename),
					version: packedPackage.version,
				})),
			},
			null,
			2,
		)}\n`,
		"utf8",
	);

	for (const packedPackage of packedPackages) {
		console.log(
			`Packed ${packedPackage.name}@${packedPackage.version} -> ${join(artifactDir, packedPackage.filename)}`,
		);
	}
	console.log(`Wrote ${manifestPath}`);
}

if (import.meta.main) {
	await main();
}
