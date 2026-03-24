import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	RELEASE_FULL_SELECTION_LABEL,
	RELEASE_WORKFLOW_PATH,
	expectedReleasePackageNames,
	expectedReleaseMatrixLabels,
	expectedTrustedPublisherEntries,
} from "./release-contract";
import {
	collectReleaseContractErrors,
	collectReleaseWorkflowErrors,
} from "./verify-release-config";

const REPO_DIR = join(import.meta.dir, "..");

test("release contract keeps native npm targets aligned with the source-host matrix", () => {
	expect(collectReleaseContractErrors()).toEqual([]);
	expect(expectedReleaseMatrixLabels()).toContain(RELEASE_FULL_SELECTION_LABEL);
});

test("release config tracks every published package in the trusted publisher contract", () => {
	const trustedPublisherEntries = expectedTrustedPublisherEntries();

	expect(trustedPublisherEntries.map((entry) => entry.packageName)).toEqual(
		expectedReleasePackageNames(),
	);
	expect(
		new Set(trustedPublisherEntries.map((entry) => entry.packageName)).size,
	).toBe(trustedPublisherEntries.length);
});

test("release workflow keeps the checked publish and annotated-tag guards", () => {
	const workflowText = readFileSync(
		join(REPO_DIR, RELEASE_WORKFLOW_PATH),
		"utf8",
	);

	expect(collectReleaseWorkflowErrors(workflowText)).toEqual([]);
});

test("release workflow verification flags missing annotated-tag note extraction", () => {
	const workflowText = [
		"name: Release",
		"",
		"on:",
		"  push:",
		'    tags:\n      - "v*"',
	].join("\n");

	expect(collectReleaseWorkflowErrors(workflowText)).toContain(
		"Release workflow must source the npm matrix from scripts/host-validation-matrix.ts.",
	);
	expect(collectReleaseWorkflowErrors(workflowText)).toContain(
		"Release workflow must derive GitHub release notes from the annotated tag contents.",
	);
});
