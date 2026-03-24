#!/usr/bin/env bun

import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expectedReleasePackageNames } from "./release-contract";

const REPO_DIR = join(import.meta.dir, "..");
const DEFAULT_ARTIFACT_DIR = join(REPO_DIR, "dist", "npm-release-artifacts");

type ParsedArguments = {
	allowMissingPackages: boolean;
	artifactDir: string;
	dryRun: boolean;
	tag: string;
};

type PackageArtifact = {
	filename: string;
	name: string;
	tarballPath: string;
	version: string;
};

type PackageArtifactManifest = {
	packages?: PackageArtifact[];
};

const COMMON_PACKAGE_ORDER = [
	"@as-harness/shared",
	"@as-harness/js",
	"@as-harness/wazero",
	"@as-harness/wasmtime",
	"@as-harness/cli",
] as const;

function parseArguments(argv: string[]): ParsedArguments {
	let allowMissingPackages = false;
	let artifactDir = DEFAULT_ARTIFACT_DIR;
	let dryRun = false;
	let tag = "latest";

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];

		if (argument === "--allow-missing-packages") {
			allowMissingPackages = true;
			continue;
		}

		if (argument === "--artifact-dir") {
			artifactDir = argv[index + 1] ?? artifactDir;
			index += 1;
			continue;
		}

		if (argument === "--dry-run") {
			dryRun = true;
			continue;
		}

		if (argument === "--tag") {
			tag = argv[index + 1] ?? tag;
			index += 1;
			continue;
		}

		throw new Error(`Unknown argument: ${argument}`);
	}

	return { allowMissingPackages, artifactDir, dryRun, tag };
}

function npmExecutable() {
	return process.platform === "win32" ? "npm.cmd" : "npm";
}

async function runCommandResult(command: string[], cwd: string) {
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

	return { exitCode, stderr, stdout };
}

async function runCommand(command: string[], cwd: string) {
	const { exitCode, stderr, stdout } = await runCommandResult(command, cwd);

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
}

function isPackageVersionNotFound(output: string) {
	return /\bE404\b|404 Not Found|No match found for version/i.test(output);
}

async function isPackageVersionPublished(packageArtifact: PackageArtifact) {
	const packageSpec = `${packageArtifact.name}@${packageArtifact.version}`;
	const result = await runCommandResult(
		[npmExecutable(), "view", packageSpec, "version", "--json"],
		REPO_DIR,
	);

	if (result.exitCode === 0) {
		return true;
	}

	const combinedOutput = [result.stdout, result.stderr]
		.filter(Boolean)
		.join("\n");
	if (isPackageVersionNotFound(combinedOutput)) {
		return false;
	}

	throw new Error(
		[
			`Failed to resolve ${packageSpec} on the npm registry before publish.`,
			combinedOutput,
		]
			.filter(Boolean)
			.join("\n\n"),
	);
}

async function findManifestPaths(directory: string): Promise<string[]> {
	const manifestPaths: string[] = [];
	const entries = await readdir(directory, { withFileTypes: true });

	for (const entry of entries) {
		const entryPath = join(directory, entry.name);
		if (entry.isDirectory()) {
			manifestPaths.push(...(await findManifestPaths(entryPath)));
			continue;
		}

		if (entry.isFile() && entry.name === "npm-package-artifacts.json") {
			manifestPaths.push(entryPath);
		}
	}

	return manifestPaths;
}

async function loadPackageArtifacts(artifactDir: string) {
	const manifestPaths = await findManifestPaths(artifactDir);
	if (manifestPaths.length === 0) {
		throw new Error(
			`No npm-package-artifacts.json files were found in ${artifactDir}.`,
		);
	}

	const packages = new Map<string, PackageArtifact>();
	for (const manifestPath of manifestPaths) {
		const manifestDirectory = dirname(manifestPath);
		const manifest = JSON.parse(
			await readFile(manifestPath, "utf8"),
		) as PackageArtifactManifest;

		for (const packageArtifact of manifest.packages ?? []) {
			if (packages.has(packageArtifact.name)) {
				throw new Error(
					`Duplicate packed npm package artifact for ${packageArtifact.name}.`,
				);
			}

			packages.set(packageArtifact.name, {
				...packageArtifact,
				tarballPath: join(manifestDirectory, packageArtifact.filename),
			});
		}
	}

	return packages;
}

function assertRequiredPackagesPresent(
	packages: Map<string, PackageArtifact>,
	allowMissingPackages: boolean,
) {
	if (allowMissingPackages) {
		return;
	}

	const missingPackageNames = expectedReleasePackageNames().filter(
		(packageName) => !packages.has(packageName),
	);
	if (missingPackageNames.length === 0) {
		return;
	}

	throw new Error(
		`Missing packed npm package artifacts for: ${missingPackageNames.join(", ")}`,
	);
}

function packagePublishOrder(packageName: string) {
	if (packageName === "@as-harness/shared") {
		return 0;
	}

	if (packageName === "@as-harness/js") {
		return 1;
	}

	if (packageName.startsWith("@as-harness/wazero-")) {
		return 2;
	}

	if (packageName === "@as-harness/wazero") {
		return 3;
	}

	if (packageName.startsWith("@as-harness/wasmtime-")) {
		return 4;
	}

	if (packageName === "@as-harness/wasmtime") {
		return 5;
	}

	if (packageName === "@as-harness/cli") {
		return 6;
	}

	return 7;
}

function sortedPackageArtifacts(packages: Map<string, PackageArtifact>) {
	return [...packages.values()].sort((left, right) => {
		const orderDifference =
			packagePublishOrder(left.name) - packagePublishOrder(right.name);
		if (orderDifference !== 0) {
			return orderDifference;
		}

		return left.name.localeCompare(right.name);
	});
}

async function main() {
	const { allowMissingPackages, artifactDir, dryRun, tag } = parseArguments(
		process.argv.slice(2),
	);
	const packages = await loadPackageArtifacts(artifactDir);
	assertRequiredPackagesPresent(packages, allowMissingPackages);

	for (const packageArtifact of sortedPackageArtifacts(packages)) {
		if (await isPackageVersionPublished(packageArtifact)) {
			console.log(
				`Skipped ${packageArtifact.name}@${packageArtifact.version}; already published.`,
			);
			continue;
		}

		const publishCommand = [
			npmExecutable(),
			"publish",
			packageArtifact.tarballPath,
			"--access",
			"public",
			"--tag",
			tag,
			...(dryRun ? ["--dry-run"] : []),
		];
		await runCommand(publishCommand, REPO_DIR);
		console.log(
			`${dryRun ? "Checked" : "Published"} ${packageArtifact.name}@${packageArtifact.version}`,
		);
	}
}

if (import.meta.main) {
	await main();
}
