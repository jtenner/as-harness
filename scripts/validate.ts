#!/usr/bin/env bun

import { $ } from "bun";

const rootDir = `${import.meta.dir}/..`;
const cliDir = `${rootDir}/cli`;

console.log("Checking repo source formatting...");

await $`bun run ${rootDir}/scripts/format.ts --check`;

console.log("Repo source formatting checks passed.");
console.log("Validating cli/ with Biome lint...");

await $`bunx biome lint . --error-on-warnings`.cwd(cliDir);

console.log("cli/ Biome lint validation passed.");
