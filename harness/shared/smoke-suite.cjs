"use strict";

const { execFileSync } = require("node:child_process");
const { mkdirSync, readFileSync } = require("node:fs");
const path = require("node:path");

const PASSING_TEST_EVENTS = [
	["nodeStart", { nodeIndex: [0] }],
	["callbackStart", { hook: 1, nodeIndex: [] }],
	["callbackPass", { hook: 1, nodeIndex: [] }],
	["callbackStart", { hook: 2, nodeIndex: [] }],
	["callbackPass", { hook: 2, nodeIndex: [] }],
	["diagnostic", { nodeIndex: [0], message: "passing test diagnostic" }],
	["log", { message: "passing test trace", source: "trace", values: [11, 12] }],
	["callbackStart", { hook: 3, nodeIndex: [] }],
	["callbackPass", { hook: 3, nodeIndex: [] }],
	["callbackStart", { hook: 4, nodeIndex: [] }],
	["callbackPass", { hook: 4, nodeIndex: [] }],
	["nodePass", { nodeIndex: [0] }],
];

const FAILING_TEST_EVENTS = [
	["nodeStart", { nodeIndex: [1] }],
	["callbackStart", { hook: 1, nodeIndex: [] }],
	["callbackPass", { hook: 1, nodeIndex: [] }],
	["callbackStart", { hook: 2, nodeIndex: [] }],
	["callbackPass", { hook: 2, nodeIndex: [] }],
	["log", { message: "failing test trace", source: "trace", values: [12] }],
	["failMessage", { message: "node:test smoke mismatch" }],
	["nodeFail", { nodeIndex: [1], failureKind: 1 }],
];

const PLANNED_MISMATCH_EVENTS = [
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
	["nodeFail", { nodeIndex: [2], failureKind: 1 }],
];

const HOOK_FAILURE_EVENTS = [
	["nodeStart", { nodeIndex: [8, 0] }],
	["callbackStart", { hook: 1, nodeIndex: [] }],
	["callbackPass", { hook: 1, nodeIndex: [] }],
	["callbackStart", { hook: 2, nodeIndex: [] }],
	["callbackPass", { hook: 2, nodeIndex: [] }],
	["callbackStart", { hook: 2, nodeIndex: [8] }],
	["failMessage", { message: "hook beforeEach mismatch" }],
	["callbackFail", { hook: 2, nodeIndex: [8], failureKind: 1 }],
];

const TRAP_EVENTS = [
	["nodeStart", { nodeIndex: [9, 0] }],
	["callbackStart", { hook: 1, nodeIndex: [] }],
	["callbackPass", { hook: 1, nodeIndex: [] }],
	["callbackStart", { hook: 2, nodeIndex: [] }],
	["callbackPass", { hook: 2, nodeIndex: [] }],
	["nodeFail", { nodeIndex: [9, 0], failureKind: 2 }],
];

const DISCOVERY_TRAP_ROOT_EVENTS = [
	["nodeStart", { nodeIndex: [10] }],
	["callbackStart", { hook: 1, nodeIndex: [] }],
	["callbackPass", { hook: 1, nodeIndex: [] }],
	["callbackStart", { hook: 2, nodeIndex: [] }],
	["callbackPass", { hook: 2, nodeIndex: [] }],
	["nodeFail", { nodeIndex: [10], failureKind: 2 }],
];

const DISCOVERED_NODES = [
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
		nodeIndex: [7],
		kind: 1,
		declarationMode: 3,
		name: "top-level todo leaf",
	},
	{
		nodeIndex: [8],
		kind: 1,
		declarationMode: 1,
		name: "hook failure parent",
	},
	{
		nodeIndex: [9],
		kind: 1,
		declarationMode: 1,
		name: "trap parent",
	},
	{
		nodeIndex: [10],
		kind: 1,
		declarationMode: 1,
		name: "discovery trap parent",
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
	{
		nodeIndex: [8, 0],
		kind: 1,
		declarationMode: 1,
		name: "hook failure child",
	},
	{
		nodeIndex: [9, 0],
		kind: 1,
		declarationMode: 1,
		name: "trapping child",
	},
];

const PASSING_BRANCH_EVENTS = [
	{ type: "nodeStart", data: { nodeIndex: [0] } },
	{ type: "callbackStart", data: { hook: 1, nodeIndex: [] } },
	{ type: "callbackPass", data: { hook: 1, nodeIndex: [] } },
	{ type: "callbackStart", data: { hook: 2, nodeIndex: [] } },
	{ type: "callbackPass", data: { hook: 2, nodeIndex: [] } },
	{
		type: "diagnostic",
		data: { nodeIndex: [0], message: "passing test diagnostic" },
	},
	{
		type: "log",
		data: { message: "passing test trace", source: "trace", values: [11, 12] },
	},
	{ type: "callbackStart", data: { hook: 3, nodeIndex: [] } },
	{ type: "callbackPass", data: { hook: 3, nodeIndex: [] } },
	{ type: "callbackStart", data: { hook: 4, nodeIndex: [] } },
	{ type: "callbackPass", data: { hook: 4, nodeIndex: [] } },
	{ type: "nodePass", data: { nodeIndex: [0] } },
];

function compileFixture(assemblyDir, entryFile, outputPath) {
	mkdirSync(path.dirname(outputPath), { recursive: true });
	execFileSync(
		"npx",
		[
			"asc",
			entryFile,
			"--debug",
			"--exportStart",
			"__start",
			"--outFile",
			outputPath,
		],
		{
			cwd: assemblyDir,
			stdio: "inherit",
		},
	);

	return readFileSync(outputPath);
}

function compileSmokeFixtures(options) {
	const assemblyDir = path.join(options.repoDir, "assembly");
	return {
		compiledExportsWasm: compileFixture(
			assemblyDir,
			"assembly/exports.ts",
			path.join(options.cacheDir, "exports-smoke.wasm"),
		),
		compiledNodeTestWasm: compileFixture(
			assemblyDir,
			"assembly/test/node-test-smoke.ts",
			path.join(options.cacheDir, "node-test-smoke.wasm"),
		),
		compiledTrampolineWasm: compileFixture(
			assemblyDir,
			"assembly/test/trampoline-smoke.ts",
			path.join(options.cacheDir, "trampoline-smoke.wasm"),
		),
	};
}

function registerHarnessSmokeSuite(options) {
	const {
		addon,
		assert,
		compiledExportsWasm,
		compiledNodeTestWasm,
		compiledTrampolineWasm,
		test,
	} = options;
	const liveHarnesses = new Set();

	function createHarness(bytes) {
		const harness = addon.createHarness(bytes);
		liveHarnesses.add(harness);
		return harness;
	}

	function closeHarness(harness) {
		if (!liveHarnesses.has(harness)) {
			return;
		}

		liveHarnesses.delete(harness);
		if (typeof harness.close === "function") {
			harness.close();
		}
	}

	test.after(() => {
		for (const harness of liveHarnesses) {
			if (typeof harness.close === "function") {
				harness.close();
			}
		}

		liveHarnesses.clear();
	});

	test("creates a harness with per-event registration methods", () => {
		const harness = createHarness(compiledExportsWasm);

		assert.equal(typeof addon.createHarness, "function");
		assert.equal(typeof harness.onNodeFound, "function");
		assert.equal(typeof harness.onNodeStart, "function");
		assert.equal(typeof harness.onNodePass, "function");
		assert.equal(typeof harness.onNodeFail, "function");
		assert.equal(typeof harness.onFailMessage, "function");
		assert.equal(typeof harness.onCallbackStart, "function");
		assert.equal(typeof harness.onCallbackPass, "function");
		assert.equal(typeof harness.onCallbackFail, "function");
		assert.equal(typeof harness.onDiagnostic, "function");
		assert.equal(typeof harness.onLog, "function");
		assert.equal(typeof harness.callI32, "function");
		assert.equal(typeof harness.discover, "function");
		assert.equal(typeof harness.run, "function");
		assert.equal(typeof harness.start, "function");

		harness.onNodeFound(() => {});
		harness.onNodeStart(() => {});
		harness.onNodePass(() => {});
		harness.onNodeFail(() => {});
		harness.onFailMessage(() => {});
		harness.onCallbackStart(() => {});
		harness.onCallbackPass(() => {});
		harness.onCallbackFail(() => {});
		harness.onDiagnostic(() => {});
		harness.onLog(() => {});
		assert.equal(harness.discover("bad"), false);
		assert.equal(harness.run([]), true);
		assert.equal(harness.run("bad"), false);
		closeHarness(harness);
	});

	test("callI32 validates export names and reports missing exports", () => {
		const harness = createHarness(compiledTrampolineWasm);

		assert.throws(() => harness.callI32(123), {
			name: "TypeError",
			message: "expected an export name",
		});
		assert.throws(() => harness.callI32("missing"), {
			name: "Error",
			message: "failed to call zero-argument i32 export",
		});
		closeHarness(harness);
	});

	test("run(nodeIndex) executes the targeted node:test path", () => {
		const harness = createHarness(compiledNodeTestWasm);

		assert.equal(harness.run([0]), true);
		assert.equal(harness.run([1]), false);
		assert.equal(harness.run([2]), false);
		assert.equal(harness.run([3]), true);
		assert.equal(harness.run([4]), true);
		assert.equal(harness.run([5]), true);
		assert.equal(harness.run([6]), true);
		assert.equal(harness.run([7]), true);
		assert.equal(harness.run([4, 0]), true);
		assert.equal(harness.run([4, 1]), false);
		assert.equal(harness.run([8, 0]), false);
		assert.equal(harness.run([9, 0]), false);
		assert.equal(harness.run([10]), false);
		assert.equal(harness.run([11]), false);
		closeHarness(harness);
	});

	test("run(nodeIndex) emits decoded node and lifecycle events for a passing test", () => {
		const harness = createHarness(compiledNodeTestWasm);
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
		harness.onLog((event) => {
			events.push(["log", event]);
		});

		assert.equal(harness.run([0]), true);
		assert.deepEqual(events, PASSING_TEST_EVENTS);
		closeHarness(harness);
	});

	test("run(nodeIndex) emits FailMessage and stops pass events on a failing test", () => {
		const harness = createHarness(compiledNodeTestWasm);
		const events = [];

		harness.onNodeStart((event) => {
			events.push(["nodeStart", event]);
		});
		harness.onNodePass((event) => {
			events.push(["nodePass", event]);
		});
		harness.onNodeFail((event) => {
			events.push(["nodeFail", event]);
		});
		harness.onCallbackStart((event) => {
			events.push(["callbackStart", event]);
		});
		harness.onCallbackPass((event) => {
			events.push(["callbackPass", event]);
		});
		harness.onCallbackFail((event) => {
			events.push(["callbackFail", event]);
		});
		harness.onFailMessage((event) => {
			events.push(["failMessage", event]);
		});
		harness.onLog((event) => {
			events.push(["log", event]);
		});

		assert.equal(harness.run([1]), false);
		assert.deepEqual(events, FAILING_TEST_EVENTS);
		closeHarness(harness);
	});

	test("run(nodeIndex) emits FailMessage for planned assertion mismatches after cleanup hooks", () => {
		const harness = createHarness(compiledNodeTestWasm);
		const events = [];

		harness.onNodeStart((event) => {
			events.push(["nodeStart", event]);
		});
		harness.onNodePass((event) => {
			events.push(["nodePass", event]);
		});
		harness.onNodeFail((event) => {
			events.push(["nodeFail", event]);
		});
		harness.onCallbackStart((event) => {
			events.push(["callbackStart", event]);
		});
		harness.onCallbackPass((event) => {
			events.push(["callbackPass", event]);
		});
		harness.onCallbackFail((event) => {
			events.push(["callbackFail", event]);
		});
		harness.onFailMessage((event) => {
			events.push(["failMessage", event]);
		});

		assert.equal(harness.run([2]), false);
		assert.deepEqual(events, PLANNED_MISMATCH_EVENTS);
		closeHarness(harness);
	});

	test("discover(nodeIndex) emits NodeFound events for top-level and nested node:test declarations", () => {
		const harness = createHarness(compiledNodeTestWasm);
		const found = [];

		harness.onNodeFound((event) => {
			found.push(event);
		});

		assert.equal(harness.discover([]), true);
		assert.equal(harness.discover([3]), true);
		assert.equal(harness.discover([4]), true);
		assert.equal(harness.discover([5]), true);
		assert.equal(harness.discover([6]), true);
		assert.equal(harness.discover([7]), true);
		assert.equal(harness.discover([8]), true);
		assert.equal(harness.discover([9]), true);
		assert.equal(harness.discover([10]), false);
		assert.equal(harness.discover([1]), false);
		assert.deepEqual(found, DISCOVERED_NODES);
		closeHarness(harness);
	});

	test("run(nodeIndex) suppresses self-outcome significance for todo nodes", () => {
		const harness = createHarness(compiledNodeTestWasm);
		const events = [];

		harness.onNodeStart((event) => {
			events.push(["nodeStart", event]);
		});
		harness.onNodePass((event) => {
			events.push(["nodePass", event]);
		});
		harness.onFailMessage((event) => {
			events.push(["failMessage", event]);
		});

		assert.equal(harness.run([6]), true);
		assert.equal(harness.run([7]), true);
		assert.deepEqual(events, []);
		closeHarness(harness);
	});

	test("discover(nodeIndex) prunes a trapping branch and recovers on the same harness", () => {
		const harness = createHarness(compiledNodeTestWasm);
		const found = [];

		harness.onNodeFound((event) => {
			found.push(event);
		});

		assert.equal(harness.discover([10]), false);
		assert.deepEqual(found, []);

		found.length = 0;
		assert.equal(harness.discover([3]), true);
		assert.deepEqual(found, [
			{
				nodeIndex: [3, 0],
				kind: 1,
				declarationMode: 1,
				name: "nested child",
			},
		]);
		closeHarness(harness);
	});

	test("run(nodeIndex) emits hook failure events when a lifecycle callback fails", () => {
		const harness = createHarness(compiledNodeTestWasm);
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
		harness.onCallbackFail((event) => {
			events.push(["callbackFail", event]);
		});
		harness.onFailMessage((event) => {
			events.push(["failMessage", event]);
		});

		assert.equal(harness.run([8, 0]), false);
		assert.deepEqual(events, HOOK_FAILURE_EVENTS);
		closeHarness(harness);
	});

	test("run(nodeIndex) recovers cleanly after a trapped execution attempt", () => {
		const harness = createHarness(compiledNodeTestWasm);
		const trappedEvents = [];
		const recoveryEvents = [];
		let trapPhase = true;

		harness.onNodeStart((event) => {
			(trapPhase ? trappedEvents : recoveryEvents).push(["nodeStart", event]);
		});
		harness.onNodePass((event) => {
			(trapPhase ? trappedEvents : recoveryEvents).push(["nodePass", event]);
		});
		harness.onNodeFail((event) => {
			(trapPhase ? trappedEvents : recoveryEvents).push(["nodeFail", event]);
		});
		harness.onCallbackStart((event) => {
			(trapPhase ? trappedEvents : recoveryEvents).push(["callbackStart", event]);
		});
		harness.onCallbackPass((event) => {
			(trapPhase ? trappedEvents : recoveryEvents).push(["callbackPass", event]);
		});
		harness.onCallbackFail((event) => {
			(trapPhase ? trappedEvents : recoveryEvents).push(["callbackFail", event]);
		});
		harness.onDiagnostic((event) => {
			(trapPhase ? trappedEvents : recoveryEvents).push(["diagnostic", event]);
		});
		harness.onLog((event) => {
			(trapPhase ? trappedEvents : recoveryEvents).push(["log", event]);
		});
		harness.onFailMessage((event) => {
			(trapPhase ? trappedEvents : recoveryEvents).push(["failMessage", event]);
		});

		assert.equal(harness.run([9, 0]), false);
		trapPhase = false;
		assert.equal(harness.run([0]), true);

		assert.deepEqual(trappedEvents, TRAP_EVENTS);
		assert.deepEqual(recoveryEvents, PASSING_TEST_EVENTS);
		closeHarness(harness);
	});

	test("start() returns raw branch discovery and execution data", async () => {
		const harness = createHarness(compiledNodeTestWasm);
		const pending = harness.start();

		assert.equal(typeof pending?.then, "function");

		const result = await pending;
		const branchesByName = new Map(
			result.branches.map((branch) => [branch.root.name, branch]),
		);

		assert.equal(result.discoveryOk, true);
		assert.equal(result.ok, false);
		assert.equal(result.discoveredTestCount, 16);
		assert.equal(result.topLevelNodes.length, 11);
		assert.ok(result.workerCount >= 1);
		assert.ok(result.workerCount <= result.branches.length);
		assert.deepEqual(
			branchesByName
				.get("parent test")
				.executions.map((execution) => execution.node.nodeIndex),
			[[3], [3, 0]],
		);
		assert.deepEqual(
			branchesByName.get("run-only parent").discovery.nodes.map((node) => node.name),
			["run-only parent", "run-only nested child"],
		);
		assert.deepEqual(
			branchesByName
				.get("todo parent")
				.executions.map((execution) => execution.node.nodeIndex),
			[[6, 0]],
		);
		assert.deepEqual(branchesByName.get("top-level todo leaf").executions, []);
		assert.deepEqual(
			branchesByName
				.get("hook failure parent")
				.executions.map((execution) => [execution.node.nodeIndex, execution.ok]),
			[
				[[8], true],
				[[8, 0], false],
			],
		);
		assert.deepEqual(
			branchesByName
				.get("trap parent")
				.executions.map((execution) => [execution.node.nodeIndex, execution.ok]),
			[
				[[9], true],
				[[9, 0], false],
			],
		);
		assert.deepEqual(
			branchesByName.get("discovery trap parent").discovery.nodes,
			[
				{
					nodeIndex: [10],
					kind: 1,
					declarationMode: 1,
					name: "discovery trap parent",
				},
			],
		);
		assert.deepEqual(
			branchesByName
				.get("discovery trap parent")
				.executions.map((execution) => [execution.node.nodeIndex, execution.ok]),
			[
				[[10], false],
			],
		);
		assert.deepEqual(
			branchesByName.get("discovery trap parent").executions[0].events,
			DISCOVERY_TRAP_ROOT_EVENTS.map(([type, data]) => ({ type, data })),
		);
		assert.deepEqual(branchesByName.get("skipped parent").executions, []);
		assert.equal(branchesByName.get("failing test").executions[0].ok, false);
		assert.deepEqual(
			branchesByName.get("passing test").executions[0].events,
			PASSING_BRANCH_EVENTS,
		);
	});

	test("observes trap status through the host-managed trampoline", () => {
		const harness = addon.createHarness(compiledTrampolineWasm);

		assert.equal(harness.callI32("didTrapWhenCallbackReturns"), 0);
		assert.equal(harness.callI32("didTrapWhenCallbackTraps"), 1);
		assert.equal(harness.callI32("didTrapWhenNestedCallbackReturns"), 0);
		assert.equal(harness.callI32("didTrapWhenNestedCallbackTraps"), 0);
		closeHarness(harness);
	});

	test("rejects non-byte input", () => {
		assert.throws(() => addon.createHarness("not bytes"), {
			name: "TypeError",
			message: "createHarness expects a Buffer, Uint8Array, or ArrayBuffer",
		});
	});

	test("rejects invalid wasm bytes", () => {
		assert.throws(
			() => addon.createHarness(Buffer.from([0x00, 0x61, 0x73, 0x6d])),
			(error) =>
				error instanceof Error &&
				typeof error.message === "string" &&
				error.message.length > 0,
		);
	});
}

module.exports = {
	compileSmokeFixtures,
	registerHarnessSmokeSuite,
};
