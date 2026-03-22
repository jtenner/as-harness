#!/usr/bin/env bun

import { $ } from "bun";
import type { SourceHarness } from "../cli/build-targets";
import { sourceHarnessSmokeCommands } from "./source-host-smoke";

const rootDir = import.meta.dir + "/..";
const assemblyDir = `${rootDir}/assembly`;
const outputFile = "build/test-debug.wasm";
const legacyAssertSmokeFile = "build/assert-bridge-node-assert.wasm";
const strictAssertSmokeFile = "build/assert-bridge-node-assert-strict.wasm";
const jasmineSmokeFile = "build/jasmine-smoke.wasm";
const mochaSmokeFile = "build/mocha-smoke.wasm";
const vitestSmokeFile = "build/vitest-smoke.wasm";

async function runCommand(command: string[], cwd: string) {
	const processHandle = Bun.spawn(command, {
		cwd,
		stderr: "inherit",
		stdout: "inherit",
	});
	const exitCode = await processHandle.exited;
	if (exitCode !== 0) {
		throw new Error(
			`Command ${command.join(" ")} failed in ${cwd} with exit code ${exitCode}.`,
		);
	}
}

async function runSourceHarnessSmoke(harness: SourceHarness) {
	console.log(`Running ${harness} host smoke checks...`);
	for (const { command, cwd } of sourceHarnessSmokeCommands(harness)) {
		await runCommand(command, cwd);
	}
	console.log(`${harness} host smoke checks completed.`);
}

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

console.log("Compiling jasmine adapter smoke fixture...");

await $`npx asc assembly/test/jasmine-smoke.ts --debug --exportStart __start --outFile ${jasmineSmokeFile}`.cwd(
	assemblyDir,
);

console.log("Compiling mocha adapter smoke fixture...");

await $`npx asc assembly/test/mocha-smoke.ts --debug --exportStart __start --outFile ${mochaSmokeFile}`.cwd(
	assemblyDir,
);

console.log("Compiling vitest adapter smoke fixture...");

await $`npx asc assembly/test/vitest-smoke.ts --debug --exportStart __start --outFile ${vitestSmokeFile}`.cwd(
	assemblyDir,
);

console.log("Running node:assert bridge smoke checks...");

await $`bun run ${rootDir}/scripts/assert-bridge-smoke.ts`;

console.log("node:assert bridge smoke checks completed.");

await runSourceHarnessSmoke("js");
await runSourceHarnessSmoke("wazero");
await runSourceHarnessSmoke("wasmtime");
