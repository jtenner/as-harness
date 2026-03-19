#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	RELEASE_BUILD_TARGETS,
	executableFilenameForTarget,
	releaseAssetFilenameForTarget,
} from "../cli/build-targets";
import packageJson from "../cli/package.json";

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

function expectedTagForVersion(version: string) {
	return `v${version}`;
}

async function sha256ForFile(path: string) {
	const contents = await readFile(path);
	return createHash("sha256").update(contents).digest("hex");
}

function renderReleaseNotes(tag: string) {
	const version = packageJson.version;
	const lines = [
		`# ${tag}`,
		"",
		`Automated GitHub release for \`@as-harness/cli\` ${version}.`,
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
		"- The normal CI workflow validates source-host smoke coverage separately from the packaged release matrix.",
		"- Packaged Windows artifacts are currently `js`-only.",
		"- Packaged `wazero` support is currently shipped on macOS and Linux release artifacts.",
		"- Source-based Windows `wazero` development remains supported outside the packaged executable path.",
		"- Source-based `wasmtime` support is validated in CI but is not bundled into the packaged release artifacts yet.",
		"- `LICENSE` carries the project MIT license for this release.",
		"- `THIRD_PARTY_NOTICES.md` and the tracked third-party license texts are included in the release asset set.",
		"- `SHA256SUMS.txt` contains checksums for the packaged executables in this release.",
		"",
	];

	return `${lines.join("\n")}\n`;
}

async function main() {
	const { assetDir, notesFile, tag } = parseArguments(process.argv.slice(2));
	const manifestPath = join(assetDir, "release-manifest.json");
	const checksumsPath = join(assetDir, "SHA256SUMS.txt");
	const generatedAt = new Date().toISOString();
	const version = packageJson.version;
	const expectedTag = expectedTagForVersion(version);

	if (tag !== expectedTag) {
		throw new Error(
			`Release tag ${JSON.stringify(tag)} does not match cli/package.json version ${JSON.stringify(version)}. Expected ${JSON.stringify(expectedTag)}.`,
		);
	}

	const targets = await Promise.all(
		RELEASE_BUILD_TARGETS.map(
			async ({ artifactName, compileTarget, packagedHarnesses, runner }) => {
				const releaseAssetFilename =
					releaseAssetFilenameForTarget(compileTarget);
				const releaseAssetPath = join(assetDir, releaseAssetFilename);
				const sha256 = await sha256ForFile(releaseAssetPath);

				return {
					artifactName,
					compileTarget,
					executableName: executableFilenameForTarget(compileTarget),
					packagedHarnesses,
					releaseAssetFilename,
					runner,
					sha256,
				};
			},
		),
	);

	const manifest = {
		generatedAt,
		tag,
		version,
		targets,
	};
	const checksumLines = targets.map(
		({ releaseAssetFilename, sha256 }) => `${sha256}  ${releaseAssetFilename}`,
	);

	await mkdir(assetDir, { recursive: true });
	await mkdir(dirname(notesFile), { recursive: true });
	await writeFile(
		manifestPath,
		`${JSON.stringify(manifest, null, 2)}\n`,
		"utf8",
	);
	await writeFile(checksumsPath, `${checksumLines.join("\n")}\n`, "utf8");
	await writeFile(notesFile, renderReleaseNotes(tag), "utf8");

	console.log(`Wrote ${manifestPath}`);
	console.log(`Wrote ${checksumsPath}`);
	console.log(`Wrote ${notesFile}`);
}

await main();
