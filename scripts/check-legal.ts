#!/usr/bin/env bun

import { readFile } from "node:fs/promises";
import {
	THIRD_PARTY_NOTICES_PATH,
	loadPackagedLegalSnapshot,
	renderThirdPartyNotices,
} from "./legal-metadata";
import {
	WASMTIME_LICENSE_INVENTORY_PATH,
	loadWasmtimeCargoMetadata,
	renderWasmtimeLicenseInventory,
} from "./generate-wasmtime-license-inventory";

async function assertFileContentMatches(path: string, expected: string) {
	const actual = await readFile(path, "utf8");
	if (actual !== expected) {
		throw new Error(
			[
				`Generated legal artifact is stale: ${path}`,
				"Regenerate the tracked legal files before validating or committing.",
			].join("\n"),
		);
	}
}

console.log("Checking packaged third-party notices...");
await assertFileContentMatches(
	THIRD_PARTY_NOTICES_PATH,
	renderThirdPartyNotices(await loadPackagedLegalSnapshot()),
);

console.log("Checking wasmtime source-build license inventory...");
await assertFileContentMatches(
	WASMTIME_LICENSE_INVENTORY_PATH,
	renderWasmtimeLicenseInventory(await loadWasmtimeCargoMetadata()),
);

console.log("Legal inventory checks passed.");
