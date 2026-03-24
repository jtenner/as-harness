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
console.log("Checking generated legal inventories...");

await $`bun run ${rootDir}/scripts/check-legal.ts`;

console.log("Generated legal inventory checks passed.");
console.log("Checking release workflow and publishing contract...");

await $`bun run ${rootDir}/scripts/verify-release-config.ts`;

console.log("Release workflow and publishing contract checks passed.");
