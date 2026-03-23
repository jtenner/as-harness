import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LEGAL_ASSETS, stageLegalAssets } from "./stage-release-legal";

const stagedDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		stagedDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true })),
	);
});

test("stageLegalAssets copies the tracked legal bundle including compiler transitive licenses", async () => {
	const directory = await mkdtemp(join(tmpdir(), "as-harness-legal-"));
	stagedDirectories.push(directory);

	await stageLegalAssets(directory);

	const stagedFilenames = (await readdir(directory)).sort();
	const expectedFilenames = LEGAL_ASSETS.map(
		({ destinationFilename }) => destinationFilename,
	).sort();

	expect(stagedFilenames).toEqual(expectedFilenames);
	expect(stagedFilenames).toContain("BINARYEN-LICENSE.txt");
	expect(stagedFilenames).toContain("BINARYEN-FP16-LICENSE.txt");
	expect(stagedFilenames).toContain("LONG-LICENSE.txt");
});
