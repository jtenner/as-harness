#!/usr/bin/env bun

import { $ } from "bun";

const rootDir = import.meta.dir + "/..";
const assemblyDir = `${rootDir}/assembly`;
const outputFile = "build/test-debug.wasm";

console.log("Compiling assembly test entrypoint...");

await $`npx asc assembly/test/index.ts --bindings esm --debug --sourceMap --exportStart __start --outFile ${outputFile}`.cwd(
  assemblyDir,
);

console.log("Running assembly test bootstrap...");

await $`bun run ${rootDir}/scripts/test-bootstrap.ts`;

console.log("Assembly test bootstrap completed.");
