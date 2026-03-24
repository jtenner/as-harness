#!/usr/bin/env bun

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
	RELEASE_FULL_SELECTION_LABEL,
	RELEASE_REPOSITORY,
	RELEASE_TAG_PATTERN,
	RELEASE_WORKFLOW_PATH,
	TRUSTED_PUBLISHING_MIN_NODE,
	TRUSTED_PUBLISHING_MIN_NPM,
	expectedNativePackageLabels,
	expectedReleaseMatrixLabels,
	expectedTrustedPublisherEntries,
} from "./release-contract";

const REPO_DIR = join(import.meta.dir, "..");

type ParsedArguments = {
	tag: string | null;
};

function parseArguments(argv: string[]): ParsedArguments {
	let tag: string | null = null;

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];

		if (argument === "--tag") {
			tag = argv[index + 1] ?? null;
			index += 1;
			continue;
		}

		throw new Error(`Unknown argument: ${argument}`);
	}

	return { tag };
}

export function collectReleaseWorkflowErrors(workflowText: string) {
	const errors: string[] = [];

	if (!workflowText.includes('      - "v*"')) {
		errors.push(
			`Release workflow must trigger on annotated tags matching ${JSON.stringify(RELEASE_TAG_PATTERN)}.`,
		);
	}

	if (
		!workflowText.includes(
			'run: printf \'matrix=%s\\n\' "$(bun run ./scripts/host-validation-matrix.ts)" >> "$GITHUB_OUTPUT"',
		)
	) {
		errors.push(
			"Release workflow must source the npm matrix from scripts/host-validation-matrix.ts.",
		);
	}

	if (
		!workflowText.includes(
			"NPM_PACKAGE_SELECTION: ${{ matrix.label == 'linux-x64' && 'all' || 'native' }}",
		)
	) {
		errors.push(
			`Release workflow must reserve full package validation for ${RELEASE_FULL_SELECTION_LABEL}.`,
		);
	}

	if (
		!workflowText.includes(
			"permissions:\n      contents: read\n      id-token: write",
		)
	) {
		errors.push(
			"Release workflow publish-npm job must request id-token: write for npm trusted publishing.",
		);
	}

	if (
		!workflowText.includes(
			"run: bun run npm:publish-release -- --artifact-dir ./dist/npm-release-artifacts --tag latest",
		)
	) {
		errors.push(
			"Release workflow must publish the collected npm tarballs through npm:publish-release.",
		);
	}

	if (
		!workflowText.includes(
			'git tag -l --format=\'%(contents)\' "${GITHUB_REF_NAME}" > "${NOTES_FILE}"',
		)
	) {
		errors.push(
			"Release workflow must derive GitHub release notes from the annotated tag contents.",
		);
	}

	if (
		!workflowText.includes(
			'echo "Missing annotated tag contents for ${GITHUB_REF_NAME}."',
		)
	) {
		errors.push(
			"Release workflow must fail clearly when the pushed release tag has no annotation body.",
		);
	}

	return errors;
}

export function collectReleaseContractErrors() {
	const errors: string[] = [];
	const expectedMatrixLabels = expectedReleaseMatrixLabels();
	const expectedNativeLabels = expectedNativePackageLabels();

	if (expectedMatrixLabels.length === 0) {
		errors.push("Source-host validation targets must not be empty.");
	}

	if (
		expectedMatrixLabels.join(",") !== expectedNativeLabels.join(",") ||
		expectedMatrixLabels.length !== expectedNativeLabels.length
	) {
		errors.push(
			[
				"Native npm target labels must stay aligned with the source-host matrix.",
				`source-host labels: ${expectedMatrixLabels.join(", ")}`,
				`native target labels: ${expectedNativeLabels.join(", ")}`,
			].join("\n"),
		);
	}

	if (!expectedMatrixLabels.includes(RELEASE_FULL_SELECTION_LABEL)) {
		errors.push(
			`Source-host validation targets must include ${RELEASE_FULL_SELECTION_LABEL} for full npm release verification.`,
		);
	}

	const trustedPublisherEntries = expectedTrustedPublisherEntries();
	const duplicatePublisherPackages = trustedPublisherEntries.filter(
		(entry, index) =>
			trustedPublisherEntries.findIndex(
				(candidate) => candidate.packageName === entry.packageName,
			) !== index,
	);

	if (duplicatePublisherPackages.length > 0) {
		errors.push(
			`Trusted publisher package list contains duplicates: ${duplicatePublisherPackages
				.map((entry) => entry.packageName)
				.join(", ")}`,
		);
	}

	return errors;
}

function readAnnotatedTagContents(tag: string) {
	const result = spawnSync("git", ["tag", "-l", "--format=%(contents)", tag], {
		cwd: REPO_DIR,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});

	if (result.status !== 0) {
		throw new Error(
			[
				`Failed to inspect git tag ${tag}.`,
				result.stdout?.trim(),
				result.stderr?.trim(),
			]
				.filter(Boolean)
				.join("\n"),
		);
	}

	return (result.stdout ?? "").trim();
}

function renderTrustedPublishingSummary() {
	const lines = [
		"# Release Preflight Verification",
		"",
		"## Trusted Publishing Contract",
		"",
		`- repository: \`${RELEASE_REPOSITORY}\``,
		`- workflow: \`${RELEASE_WORKFLOW_PATH}\``,
		`- minimum Node for publish job: \`${TRUSTED_PUBLISHING_MIN_NODE}\``,
		`- minimum npm for publish job: \`${TRUSTED_PUBLISHING_MIN_NPM}\``,
		"",
		"Packages that must have matching npm trusted publisher entries:",
		"",
		...expectedTrustedPublisherEntries().map(
			(entry) =>
				`- \`${entry.packageName}\` -> \`${entry.repository}\` / \`${entry.workflowPath}\``,
		),
		"",
	];

	return `${lines.join("\n")}\n`;
}

async function main() {
	const { tag } = parseArguments(process.argv.slice(2));
	const workflowPath = join(REPO_DIR, RELEASE_WORKFLOW_PATH);
	const workflowText = await readFile(workflowPath, "utf8");
	const errors = [
		...collectReleaseContractErrors(),
		...collectReleaseWorkflowErrors(workflowText),
	];

	if (tag) {
		const tagContents = readAnnotatedTagContents(tag);
		if (!tagContents) {
			errors.push(`Release tag ${tag} is missing annotated contents.`);
		}
	}

	if (errors.length > 0) {
		throw new Error(errors.join("\n\n"));
	}

	console.log(renderTrustedPublishingSummary());
}

if (import.meta.main) {
	await main();
}
