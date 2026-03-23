#!/usr/bin/env bun

import { writeFile } from "node:fs/promises";
import {
	THIRD_PARTY_NOTICES_PATH,
	loadPackagedLegalSnapshot,
	renderThirdPartyNotices,
} from "./legal-metadata";

async function main() {
	const snapshot = await loadPackagedLegalSnapshot();
	await writeFile(
		THIRD_PARTY_NOTICES_PATH,
		renderThirdPartyNotices(snapshot),
		"utf8",
	);
	console.log(`Wrote ${THIRD_PARTY_NOTICES_PATH}`);
}

await main();
