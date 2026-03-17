#!/usr/bin/env bun

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	RELEASE_BUILD_TARGETS,
	executableFilenameForTarget,
	releaseAssetFilenameForTarget,
} from "../cli/build-targets";

type ParsedArguments = {
	assetDir: string;
	notesFile: string;
	tag: string;
};

function parseArguments(argv: string[]): ParsedArguments {
	let assetDir: string | undefined;
	let notesFile: string | undefined;
	let tag: string | undefined;

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];

		if (argument === "--asset-dir") {
			assetDir = argv[index + 1];
			index += 1;
			continue;
		}

		if (argument === "--notes-file") {
			notesFile = argv[index + 1];
			index += 1;
			continue;
		}

		if (argument === "--tag") {
			tag = argv[index + 1];
			index += 1;
			continue;
		}

		throw new Error(`Unknown argument: ${argument}`);
	}

	if (!assetDir) {
		throw new Error("Missing required --asset-dir <directory> argument.");
	}

	if (!notesFile) {
		throw new Error("Missing required --notes-file <path> argument.");
	}

	if (!tag) {
		throw new Error("Missing required --tag <release-tag> argument.");
	}

	return { assetDir, notesFile, tag };
}

function renderReleaseNotes(tag: string) {
	const lines = [
		`# ${tag}`,
		"",
		"Automated GitHub release for the current packaged CLI matrix.",
		"",
		"## Artifacts",
		"",
		...RELEASE_BUILD_TARGETS.map(
			({ artifactName, compileTarget, packagedHarnesses }) =>
				`- \`${artifactName}\`: compile target \`${compileTarget}\`, packaged harnesses ${packagedHarnesses.map((harness) => `\`${harness}\``).join(", ")}`,
		),
		"",
		"## Notes",
		"",
		"- Packaged Windows artifacts are currently `js`-only.",
		"- Packaged `wazero` support is currently shipped on macOS and Linux release artifacts.",
		"- Source-based Windows `wazero` development remains supported outside the packaged executable path.",
		"",
	];

	return `${lines.join("\n")}\n`;
}

async function main() {
	const { assetDir, notesFile, tag } = parseArguments(process.argv.slice(2));
	const manifestPath = join(assetDir, "release-manifest.json");
	const generatedAt = new Date().toISOString();
	const manifest = {
		generatedAt,
		tag,
		targets: RELEASE_BUILD_TARGETS.map(
			({ artifactName, compileTarget, packagedHarnesses, runner }) => ({
				artifactName,
				compileTarget,
				executableName: executableFilenameForTarget(compileTarget),
				packagedHarnesses,
				releaseAssetFilename: releaseAssetFilenameForTarget(compileTarget),
				runner,
			}),
		),
	};

	await mkdir(assetDir, { recursive: true });
	await mkdir(dirname(notesFile), { recursive: true });
	await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
	await writeFile(notesFile, renderReleaseNotes(tag), "utf8");

	console.log(`Wrote ${manifestPath}`);
	console.log(`Wrote ${notesFile}`);
}

await main();
