#!/usr/bin/env bun

import { $ } from "bun";

const cliDir = `${import.meta.dir}/../cli`;

console.log("Validating cli/ with Biome...");

await $`bunx biome format .`.cwd(cliDir);
await $`bunx biome lint . --error-on-warnings`.cwd(cliDir);

console.log("cli/ Biome validation passed.");
