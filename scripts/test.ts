#!/usr/bin/env bun

import { $ } from "bun";

const rootDir = import.meta.dir + "/..";
const assemblyDir = `${rootDir}/assembly`;
const outputFile = "build/test-debug.wasm";
const legacyAssertSmokeFile = "build/assert-bridge-node-assert.wasm";
const strictAssertSmokeFile = "build/assert-bridge-node-assert-strict.wasm";
const vitestSmokeFile = "build/vitest-smoke.wasm";

console.log("Compiling assembly test entrypoint...");

await $`npx asc assembly/test/index.ts --bindings esm --debug --sourceMap --exportStart __start --outFile ${outputFile}`.cwd(
  assemblyDir,
);

console.log("Running assembly test bootstrap...");

await $`bun run ${rootDir}/scripts/test-bootstrap.ts`;

console.log("Assembly test bootstrap completed.");

console.log("Compiling node:assert bridge smoke fixture...");

await $`npx asc assembly/test/node-assert-smoke.ts --debug --exportStart __start --outFile ${legacyAssertSmokeFile}`.cwd(
  assemblyDir,
);

console.log("Compiling node:assert/strict bridge smoke fixture...");

await $`npx asc assembly/test/node-assert-strict-smoke.ts --debug --exportStart __start --outFile ${strictAssertSmokeFile}`.cwd(
  assemblyDir,
);

console.log("Compiling vitest adapter smoke fixture...");

await $`npx asc assembly/test/vitest-smoke.ts --debug --exportStart __start --outFile ${vitestSmokeFile}`.cwd(
  assemblyDir,
);

console.log("Running node:assert bridge smoke checks...");

await $`bun run ${rootDir}/scripts/assert-bridge-smoke.ts`;

console.log("node:assert bridge smoke checks completed.");
