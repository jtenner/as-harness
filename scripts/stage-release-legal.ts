#!/usr/bin/env bun

import { cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";

const REPO_DIR = join(import.meta.dir, "..");

type ParsedArguments = {
	assetDir: string;
};

type LegalAsset = {
	destinationFilename: string;
	sourcePath: string;
};

const LEGAL_ASSETS: LegalAsset[] = [
	{
		destinationFilename: "LICENSE",
		sourcePath: join(REPO_DIR, "LICENSE"),
	},
	{
		destinationFilename: "THIRD_PARTY_NOTICES.md",
		sourcePath: join(REPO_DIR, "THIRD_PARTY_NOTICES.md"),
	},
	{
		destinationFilename: "ASSEMBLYSCRIPT-LICENSE.txt",
		sourcePath: join(REPO_DIR, "licenses", "assemblyscript", "LICENSE"),
	},
	{
		destinationFilename: "ASSEMBLYSCRIPT-NOTICE.txt",
		sourcePath: join(REPO_DIR, "licenses", "assemblyscript", "NOTICE"),
	},
	{
		destinationFilename: "WAZERO-LICENSE.txt",
		sourcePath: join(REPO_DIR, "licenses", "wazero", "LICENSE"),
	},
	{
		destinationFilename: "WAZERO-NOTICE.txt",
		sourcePath: join(REPO_DIR, "licenses", "wazero", "NOTICE"),
	},
	{
		destinationFilename: "GOLANG-X-SYS-LICENSE.txt",
		sourcePath: join(REPO_DIR, "licenses", "golang.org-x-sys", "LICENSE"),
	},
];

function parseArguments(argv: string[]): ParsedArguments {
	let assetDir: string | undefined;

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];

		if (argument === "--asset-dir") {
			assetDir = argv[index + 1];
			index += 1;
			continue;
		}

		throw new Error(`Unknown argument: ${argument}`);
	}

	if (!assetDir) {
		throw new Error("Missing required --asset-dir <directory> argument.");
	}

	return { assetDir };
}

async function main() {
	const { assetDir } = parseArguments(process.argv.slice(2));
	await mkdir(assetDir, { recursive: true });

	for (const asset of LEGAL_ASSETS) {
		if (!existsSync(asset.sourcePath)) {
			throw new Error(
				`Missing legal asset source ${JSON.stringify(asset.sourcePath)}.`,
			);
		}

		const destinationPath = join(assetDir, asset.destinationFilename);
		await cp(asset.sourcePath, destinationPath);
		console.log(`Copied ${basename(asset.sourcePath)} to ${destinationPath}`);
	}
}

await main();
