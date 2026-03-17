const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const test = require("node:test");

const addon = require("..");

const repoDir = path.resolve(__dirname, "..", "..", "..");
const assemblyDir = path.join(repoDir, "assembly");
const cliEntrypointPath = path.join(repoDir, "cli", "index.ts");
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
	assert.equal(typeof harness.onDiagnostic, "function");
	assert.equal(typeof harness.callI32, "function");
	assert.equal(typeof harness.discover, "function");
	assert.equal(typeof harness.run, "function");
	assert.equal(typeof harness.start, "function");

	harness.onNodeFound(() => { });
	harness.onNodeStart(() => { });
	harness.onNodePass(() => { });
	harness.onFailMessage(() => { });
	harness.onCallbackStart(() => { });
	harness.onCallbackPass(() => { });
	harness.onDiagnostic(() => { });
	assert.equal(harness.run([]), true);
	assert.equal(harness.run("bad"), false);
});

test("run(nodeIndex) executes the targeted node:test path", () => {
	const harness = addon.createHarness(compiledNodeTestWasm);

	assert.equal(harness.run([0]), true);
	assert.equal(harness.run([1]), false);
	assert.equal(harness.run([2]), false);
	assert.equal(harness.run([3]), true);
	assert.equal(harness.run([4]), true);
	assert.equal(harness.run([5]), true);
	assert.equal(harness.run([6]), true);
	assert.equal(harness.run([4, 0]), true);
	assert.equal(harness.run([4, 1]), false);
	assert.equal(harness.run([7]), false);
});

test("run(nodeIndex) emits decoded node and lifecycle events for a passing test", () => {
	const harness = addon.createHarness(compiledNodeTestWasm);
	const events = [];

	harness.onNodeStart((event) => {
		events.push(["nodeStart", event]);
	});
	harness.onNodePass((event) => {
		events.push(["nodePass", event]);
	});
	harness.onCallbackStart((event) => {
		events.push(["callbackStart", event]);
	});
	harness.onCallbackPass((event) => {
		events.push(["callbackPass", event]);
	});
	harness.onDiagnostic((event) => {
		events.push(["diagnostic", event]);
	});

	assert.equal(harness.run([0]), true);
	assert.deepEqual(events, [
		["nodeStart", { nodeIndex: [0] }],
		["callbackStart", { hook: 1, nodeIndex: [] }],
		["callbackPass", { hook: 1, nodeIndex: [] }],
		["callbackStart", { hook: 2, nodeIndex: [] }],
		["callbackPass", { hook: 2, nodeIndex: [] }],
		["diagnostic", { nodeIndex: [0], message: "passing test diagnostic" }],
		["callbackStart", { hook: 3, nodeIndex: [] }],
		["callbackPass", { hook: 3, nodeIndex: [] }],
		["callbackStart", { hook: 4, nodeIndex: [] }],
		["callbackPass", { hook: 4, nodeIndex: [] }],
		["nodePass", { nodeIndex: [0] }],
	]);
});

test("run(nodeIndex) emits FailMessage and stops pass events on a failing test", () => {
	const harness = addon.createHarness(compiledNodeTestWasm);
	const events = [];

	harness.onNodeStart((event) => {
		events.push(["nodeStart", event]);
	});
	harness.onNodePass((event) => {
		events.push(["nodePass", event]);
	});
	harness.onCallbackStart((event) => {
		events.push(["callbackStart", event]);
	});
	harness.onCallbackPass((event) => {
		events.push(["callbackPass", event]);
	});
	harness.onFailMessage((event) => {
		events.push(["failMessage", event]);
	});

	assert.equal(harness.run([1]), false);
	assert.deepEqual(events, [
		["nodeStart", { nodeIndex: [1] }],
		["callbackStart", { hook: 1, nodeIndex: [] }],
		["callbackPass", { hook: 1, nodeIndex: [] }],
		["callbackStart", { hook: 2, nodeIndex: [] }],
		["callbackPass", { hook: 2, nodeIndex: [] }],
		["failMessage", { message: "node:test smoke mismatch" }],
	]);
});

test("run(nodeIndex) emits FailMessage for planned assertion mismatches after cleanup hooks", () => {
	const harness = addon.createHarness(compiledNodeTestWasm);
	const events = [];

	harness.onNodeStart((event) => {
		events.push(["nodeStart", event]);
	});
	harness.onNodePass((event) => {
		events.push(["nodePass", event]);
	});
	harness.onCallbackStart((event) => {
		events.push(["callbackStart", event]);
	});
	harness.onCallbackPass((event) => {
		events.push(["callbackPass", event]);
	});
	harness.onFailMessage((event) => {
		events.push(["failMessage", event]);
	});

	assert.equal(harness.run([2]), false);
	assert.deepEqual(events, [
		["nodeStart", { nodeIndex: [2] }],
		["callbackStart", { hook: 1, nodeIndex: [] }],
		["callbackPass", { hook: 1, nodeIndex: [] }],
		["callbackStart", { hook: 2, nodeIndex: [] }],
		["callbackPass", { hook: 2, nodeIndex: [] }],
		["callbackStart", { hook: 3, nodeIndex: [] }],
		["callbackPass", { hook: 3, nodeIndex: [] }],
		["callbackStart", { hook: 4, nodeIndex: [] }],
		["callbackPass", { hook: 4, nodeIndex: [] }],
		[
			"failMessage",
			{
				message:
					'node:test plan mismatch in "planned mismatch test": expected 2 assertion(s), saw 1',
			},
		],
	]);
});

test("discover(nodeIndex) emits NodeFound events for top-level and nested node:test declarations", () => {
	const harness = addon.createHarness(compiledNodeTestWasm);
	const found = [];

	harness.onNodeFound((event) => {
		found.push(event);
	});

	assert.equal(harness.discover([]), true);
	assert.equal(harness.discover([3]), true);
	assert.equal(harness.discover([4]), true);
	assert.equal(harness.discover([6]), true);
	assert.equal(harness.discover([1]), false);
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
		{
			nodeIndex: [2],
			kind: 1,
			declarationMode: 1,
			name: "planned mismatch test",
		},
		{
			nodeIndex: [3],
			kind: 1,
			declarationMode: 1,
			name: "parent test",
		},
		{
			nodeIndex: [4],
			kind: 1,
			declarationMode: 1,
			name: "run-only parent",
		},
		{
			nodeIndex: [5],
			kind: 1,
			declarationMode: 2,
			name: "skipped parent",
		},
		{
			nodeIndex: [6],
			kind: 1,
			declarationMode: 3,
			name: "todo parent",
		},
		{
			nodeIndex: [3, 0],
			kind: 1,
			declarationMode: 1,
			name: "nested child",
		},
		{
			nodeIndex: [4, 0],
			kind: 1,
			declarationMode: 1,
			name: "run-only nested child",
		},
		{
			nodeIndex: [6, 0],
			kind: 1,
			declarationMode: 1,
			name: "todo nested child",
		},
	]);
});

test("start() returns raw branch discovery and execution data", async () => {
	const harness = addon.createHarness(compiledNodeTestWasm);
	const pending = harness.start();

	assert.equal(typeof pending?.then, "function");

	const result = await pending;
	const branchesByName = new Map(
		result.branches.map((branch) => [branch.root.name, branch]),
	);

	assert.equal(result.discoveryOk, true);
	assert.equal(result.ok, false);
	assert.equal(result.discoveredTestCount, 10);
	assert.equal(result.topLevelNodes.length, 7);
	assert.ok(result.workerCount >= 1);
	assert.ok(result.workerCount <= result.branches.length);
	assert.deepEqual(
		branchesByName.get("parent test").executions.map((execution) => execution.node.nodeIndex),
		[[3], [3, 0]],
	);
	assert.deepEqual(
		branchesByName.get("run-only parent").discovery.nodes.map((node) => node.name),
		["run-only parent", "run-only nested child"],
	);
	assert.deepEqual(
		branchesByName.get("todo parent").executions.map((execution) => execution.node.nodeIndex),
		[[6, 0]],
	);
	assert.deepEqual(branchesByName.get("skipped parent").executions, []);
	assert.equal(branchesByName.get("failing test").executions[0].ok, false);
	assert.deepEqual(
		branchesByName.get("passing test").executions[0].events,
		[
			{ type: "nodeStart", data: { nodeIndex: [0] } },
			{ type: "callbackStart", data: { hook: 1, nodeIndex: [] } },
			{ type: "callbackPass", data: { hook: 1, nodeIndex: [] } },
			{ type: "callbackStart", data: { hook: 2, nodeIndex: [] } },
			{ type: "callbackPass", data: { hook: 2, nodeIndex: [] } },
			{
				type: "diagnostic",
				data: { nodeIndex: [0], message: "passing test diagnostic" },
			},
			{ type: "callbackStart", data: { hook: 3, nodeIndex: [] } },
			{ type: "callbackPass", data: { hook: 3, nodeIndex: [] } },
			{ type: "callbackStart", data: { hook: 4, nodeIndex: [] } },
			{ type: "callbackPass", data: { hook: 4, nodeIndex: [] } },
			{ type: "nodePass", data: { nodeIndex: [0] } },
		],
	);
});

test("cli run executes tests through the wazero harness", () => {
	const tempDirectory = mkdtempSync(path.join(tmpdir(), "as-harness-wazero-cli-"));

	try {
		const entryFile = path.join(tempDirectory, "suite.test.ts");
		writeFileSync(
			entryFile,
			[
				'import { test, TestContext } from "node:test";',
				"",
				'test("passing test", (_context: TestContext): void => {});',
				"",
			].join("\n"),
			"utf8",
		);

		const result = spawnSync(
			"bun",
			["run", cliEntrypointPath, "run", "--harness", "wazero", entryFile],
			{
				cwd: tempDirectory,
				encoding: "utf8",
			},
		);

		assert.equal(result.status, 0);
		assert.equal(result.stderr, "");
		assert.match(
			result.stdout,
			/PASS 1 test\(s\) across 1 top-level node\(s\) with wazero\./,
		);
	} finally {
		rmSync(tempDirectory, { force: true, recursive: true });
	}
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
