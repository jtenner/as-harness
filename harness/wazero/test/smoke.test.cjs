const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdirSync, readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const addon = require("../dist/wazero.node");

const repoDir = path.resolve(__dirname, "..", "..", "..");
const assemblyDir = path.join(repoDir, "assembly");
const compiledFixturePath = path.join(repoDir, "harness", "wazero", ".cache", "exports-smoke.wasm");
const compiledNodeTestPath = path.join(repoDir, "harness", "wazero", ".cache", "node-test-smoke.wasm");
const compiledTrampolinePath = path.join(repoDir, "harness", "wazero", ".cache", "trampoline-smoke.wasm");

mkdirSync(path.dirname(compiledFixturePath), { recursive: true });
execFileSync(
	"npx",
	[
		"asc",
		"assembly/exports.ts",
		"--debug",
		"--exportStart",
		"__start",
		"--outFile",
		compiledFixturePath,
	],
	{
		cwd: assemblyDir,
		stdio: "inherit",
	},
);

const compiledExportsWasm = readFileSync(compiledFixturePath);

mkdirSync(path.dirname(compiledNodeTestPath), { recursive: true });
execFileSync(
	"npx",
	[
		"asc",
		"assembly/test/node-test-smoke.ts",
		"--debug",
		"--exportStart",
		"__start",
		"--outFile",
		compiledNodeTestPath,
	],
	{
		cwd: assemblyDir,
		stdio: "inherit",
	},
);

const compiledNodeTestWasm = readFileSync(compiledNodeTestPath);

mkdirSync(path.dirname(compiledTrampolinePath), { recursive: true });
execFileSync(
	"npx",
	[
		"asc",
		"assembly/test/trampoline-smoke.ts",
		"--debug",
		"--exportStart",
		"__start",
		"--outFile",
		compiledTrampolinePath,
	],
	{
		cwd: assemblyDir,
		stdio: "inherit",
	},
);

const compiledTrampolineWasm = readFileSync(compiledTrampolinePath);

test("creates a harness with per-event registration methods", () => {
	const harness = addon.createHarness(compiledExportsWasm);

	assert.equal(typeof addon.createHarness, "function");
	assert.equal(typeof harness.onNodeFound, "function");
	assert.equal(typeof harness.onNodeStart, "function");
	assert.equal(typeof harness.onNodePass, "function");
	assert.equal(typeof harness.onFailMessage, "function");
	assert.equal(typeof harness.onCallbackStart, "function");
	assert.equal(typeof harness.onCallbackPass, "function");
	assert.equal(typeof harness.callI32, "function");
	assert.equal(typeof harness.run, "function");

	harness.onNodeFound(() => {});
	harness.onNodeStart(() => {});
	harness.onNodePass(() => {});
	harness.onFailMessage(() => {});
	harness.onCallbackStart(() => {});
	harness.onCallbackPass(() => {});
	assert.equal(harness.run([]), true);
	assert.equal(harness.run("bad"), false);
});

test("run(nodeIndex) executes the targeted node:test path", () => {
	const harness = addon.createHarness(compiledNodeTestWasm);

	assert.equal(harness.run([0]), true);
	assert.equal(harness.run([1]), false);
	assert.equal(harness.run([2]), false);
});

test("callI32('discover') emits NodeFound events for top-level node:test declarations", () => {
	const harness = addon.createHarness(compiledNodeTestWasm);
	const found = [];

	harness.onNodeFound((event) => {
		found.push(event);
	});

	assert.equal(harness.callI32("discover"), 2);
	assert.deepEqual(found, [
		{
			nodeIndex: [0],
			kind: 1,
			declarationMode: 1,
			name: "passing test",
		},
		{
			nodeIndex: [1],
			kind: 1,
			declarationMode: 1,
			name: "failing test",
		},
	]);
});

test("observes trap status through the host-managed trampoline", () => {
	const harness = addon.createHarness(compiledTrampolineWasm);

	assert.equal(harness.callI32("didTrapWhenCallbackReturns"), 0);
	assert.equal(harness.callI32("didTrapWhenCallbackTraps"), 1);
});

test("rejects non-byte input", () => {
	assert.throws(() => addon.createHarness("not bytes"), {
		name: "TypeError",
	});
});

test("rejects invalid wasm bytes", () => {
	assert.throws(() => addon.createHarness(Buffer.from([0x00, 0x61, 0x73, 0x6d])), {
		name: "Error",
	});
});
