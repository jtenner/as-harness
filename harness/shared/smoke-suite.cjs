"use strict";

const { execFileSync } = require("node:child_process");
const { mkdirSync, readFileSync } = require("node:fs");
const path = require("node:path");

const NODE_METADATA_BY_INDEX = new Map([
	["0", { nodeId: 1, parentNodeId: 0, declarationOrder: 0 }],
	["1", { nodeId: 2, parentNodeId: 0, declarationOrder: 1 }],
	["2", { nodeId: 3, parentNodeId: 0, declarationOrder: 2 }],
	["3", { nodeId: 4, parentNodeId: 0, declarationOrder: 3 }],
	["4", { nodeId: 5, parentNodeId: 0, declarationOrder: 4 }],
	["5", { nodeId: 6, parentNodeId: 0, declarationOrder: 5, expectFailure: true }],
	["6", { nodeId: 7, parentNodeId: 0, declarationOrder: 6 }],
	["7", { nodeId: 8, parentNodeId: 0, declarationOrder: 7 }],
	["8", { nodeId: 9, parentNodeId: 0, declarationOrder: 8 }],
	["9", { nodeId: 10, parentNodeId: 0, declarationOrder: 9 }],
	["10", { nodeId: 11, parentNodeId: 0, declarationOrder: 10 }],
	["11", { nodeId: 12, parentNodeId: 0, declarationOrder: 11 }],
	["12", { nodeId: 13, parentNodeId: 0, declarationOrder: 12 }],
	["13", { nodeId: 14, parentNodeId: 0, declarationOrder: 13, dependencyNodeIds: [13] }],
	["14", { nodeId: 15, parentNodeId: 0, declarationOrder: 14 }],
	["15", { nodeId: 16, parentNodeId: 0, declarationOrder: 15, dependencyNodeIds: [15] }],
	["16", { nodeId: 17, parentNodeId: 0, declarationOrder: 16, expectFailure: true }],
	["17", { nodeId: 18, parentNodeId: 0, declarationOrder: 17, dependencyNodeIds: [17] }],
	["18", { nodeId: 19, parentNodeId: 0, declarationOrder: 18 }],
	["19", { nodeId: 20, parentNodeId: 0, declarationOrder: 19, dependencyNodeIds: [19] }],
	["20", { nodeId: 21, parentNodeId: 0, declarationOrder: 20 }],
	["21", { nodeId: 22, parentNodeId: 0, declarationOrder: 21, dependencyNodeIds: [21] }],
	["22", { nodeId: 23, parentNodeId: 0, declarationOrder: 22, expectFailure: true }],
	["23", { nodeId: 24, parentNodeId: 0, declarationOrder: 23, dependencyNodeIds: [23] }],
	["24", { nodeId: 25, parentNodeId: 0, declarationOrder: 24 }],
	["3.0", { nodeId: 26, parentNodeId: 4, declarationOrder: 25 }],
	["4.0", { nodeId: 26, parentNodeId: 5, declarationOrder: 25, only: true }],
	["7.0", { nodeId: 26, parentNodeId: 8, declarationOrder: 25 }],
	["9.0", { nodeId: 26, parentNodeId: 10, declarationOrder: 25 }],
	["10.0", { nodeId: 26, parentNodeId: 11, declarationOrder: 25 }],
	["24.1", { nodeId: 27, parentNodeId: 25, declarationOrder: 26, only: true, dependencyNodeIds: [26] }],
]);

function annotateNode(node) {
	const metadata = NODE_METADATA_BY_INDEX.get(node.nodeIndex.join("."));
	if (!metadata) {
		return {
			...node,
			nodeId: 0,
			parentNodeId: 0,
			declarationOrder: 0,
			sequenceMode: 0,
			dependencyNodeIds: [],
			only: false,
			expectFailure: false,
		};
	}

	return {
		...node,
		nodeId: metadata.nodeId,
		parentNodeId: metadata.parentNodeId,
		declarationOrder: metadata.declarationOrder,
		sequenceMode: 0,
		dependencyNodeIds: metadata.dependencyNodeIds ?? [],
		only: metadata.only ?? false,
		expectFailure: metadata.expectFailure ?? false,
	};
}

function annotateNodes(nodes) {
	return nodes.map((node) => annotateNode(node));
}

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

const ROOT_TARGET_EVENTS = [
	["nodeStart", { nodeIndex: [] }],
	["callbackStart", { hook: 1, nodeIndex: [] }],
	["callbackPass", { hook: 1, nodeIndex: [] }],
	["callbackStart", { hook: 2, nodeIndex: [] }],
	["callbackPass", { hook: 2, nodeIndex: [] }],
	["callbackStart", { hook: 3, nodeIndex: [] }],
	["callbackPass", { hook: 3, nodeIndex: [] }],
	["callbackStart", { hook: 4, nodeIndex: [] }],
	["callbackPass", { hook: 4, nodeIndex: [] }],
	["nodePass", { nodeIndex: [] }],
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
	["nodeStart", { nodeIndex: [9, 0] }],
	["callbackStart", { hook: 1, nodeIndex: [] }],
	["callbackPass", { hook: 1, nodeIndex: [] }],
	["callbackStart", { hook: 2, nodeIndex: [] }],
	["callbackPass", { hook: 2, nodeIndex: [] }],
	["callbackStart", { hook: 2, nodeIndex: [9] }],
	["failMessage", { message: "hook beforeEach mismatch" }],
	["callbackFail", { hook: 2, nodeIndex: [9], failureKind: 1 }],
];

const TRAP_EVENTS = [
	["nodeStart", { nodeIndex: [10, 0] }],
	["callbackStart", { hook: 1, nodeIndex: [] }],
	["callbackPass", { hook: 1, nodeIndex: [] }],
	["callbackStart", { hook: 2, nodeIndex: [] }],
	["callbackPass", { hook: 2, nodeIndex: [] }],
	["nodeFail", { nodeIndex: [10, 0], failureKind: 2 }],
];

const TODO_NESTED_CHILD_EVENTS = [
	["nodeStart", { nodeIndex: [7, 0] }],
	["callbackStart", { hook: 1, nodeIndex: [] }],
	["callbackPass", { hook: 1, nodeIndex: [] }],
	["callbackStart", { hook: 2, nodeIndex: [] }],
	["callbackPass", { hook: 2, nodeIndex: [] }],
	["callbackStart", { hook: 3, nodeIndex: [] }],
	["callbackPass", { hook: 3, nodeIndex: [] }],
	["callbackStart", { hook: 4, nodeIndex: [] }],
	["callbackPass", { hook: 4, nodeIndex: [] }],
	["nodePass", { nodeIndex: [7, 0] }],
];

const DISCOVERY_TRAP_ROOT_EVENTS = [
	["nodeStart", { nodeIndex: [11] }],
	["callbackStart", { hook: 1, nodeIndex: [] }],
	["callbackPass", { hook: 1, nodeIndex: [] }],
	["callbackStart", { hook: 2, nodeIndex: [] }],
	["callbackPass", { hook: 2, nodeIndex: [] }],
	["nodeFail", { nodeIndex: [11], failureKind: 2 }],
];

const DISCOVERED_NODES = annotateNodes([
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
		declarationMode: 1,
		name: "expected failure test",
	},
	{
		nodeIndex: [6],
		kind: 1,
		declarationMode: 2,
		name: "skipped parent",
	},
	{
		nodeIndex: [7],
		kind: 1,
		declarationMode: 3,
		name: "todo parent",
	},
	{
		nodeIndex: [8],
		kind: 1,
		declarationMode: 3,
		name: "top-level todo leaf",
	},
	{
		nodeIndex: [9],
		kind: 1,
		declarationMode: 1,
		name: "hook failure parent",
	},
	{
		nodeIndex: [10],
		kind: 1,
		declarationMode: 1,
		name: "trap parent",
	},
	{
		nodeIndex: [11],
		kind: 1,
		declarationMode: 1,
		name: "discovery trap parent",
	},
	{
		nodeIndex: [12],
		kind: 1,
		declarationMode: 1,
		name: "dependency prereq",
	},
	{
		nodeIndex: [13],
		kind: 1,
		declarationMode: 1,
		name: "dependency dependent",
	},
	{
		nodeIndex: [14],
		kind: 1,
		declarationMode: 1,
		name: "dependency failing prereq",
	},
	{
		nodeIndex: [15],
		kind: 1,
		declarationMode: 1,
		name: "dependency blocked dependent",
	},
	{
		nodeIndex: [16],
		kind: 1,
		declarationMode: 1,
		name: "dependency expected failure prereq",
	},
	{
		nodeIndex: [17],
		kind: 1,
		declarationMode: 1,
		name: "dependency satisfied dependent",
	},
	{
		nodeIndex: [18],
		kind: 1,
		declarationMode: 2,
		name: "dependency skipped prereq",
	},
	{
		nodeIndex: [19],
		kind: 1,
		declarationMode: 1,
		name: "dependency skipped dependent",
	},
	{
		nodeIndex: [20],
		kind: 1,
		declarationMode: 3,
		name: "dependency todo prereq",
	},
	{
		nodeIndex: [21],
		kind: 1,
		declarationMode: 1,
		name: "dependency todo dependent",
	},
	{
		nodeIndex: [22],
		kind: 1,
		declarationMode: 1,
		name: "dependency unexpected pass prereq",
	},
	{
		nodeIndex: [23],
		kind: 1,
		declarationMode: 1,
		name: "dependency unexpected pass dependent",
	},
	{
		nodeIndex: [24],
		kind: 1,
		declarationMode: 1,
		name: "dependency only parent",
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
		nodeIndex: [7, 0],
		kind: 1,
		declarationMode: 1,
		name: "todo nested child",
	},
	{
		nodeIndex: [9, 0],
		kind: 1,
		declarationMode: 1,
		name: "hook failure child",
	},
	{
		nodeIndex: [10, 0],
		kind: 1,
		declarationMode: 1,
		name: "trapping child",
	},
	{
		nodeIndex: [24, 1],
		kind: 1,
		declarationMode: 1,
		name: "dependency only included dependent",
	},
]);

const TARGETED_PARENT_DISCOVERY = annotateNodes([
	{
		nodeIndex: [3],
		kind: 1,
		declarationMode: 1,
		name: "parent test",
	},
	{
		nodeIndex: [3, 0],
		kind: 1,
		declarationMode: 1,
		name: "nested child",
	},
]);

const TARGETED_ONLY_DISCOVERY = annotateNodes([
	{
		nodeIndex: [4],
		kind: 1,
		declarationMode: 1,
		name: "run-only parent",
	},
	{
		nodeIndex: [4, 0],
		kind: 1,
		declarationMode: 1,
		name: "run-only nested child",
	},
]);

const TARGETED_EXPECT_FAILURE_DISCOVERY = annotateNodes([
	{
		nodeIndex: [5],
		kind: 1,
		declarationMode: 1,
		name: "expected failure test",
	},
]);

const TARGETED_SKIP_DISCOVERY = annotateNodes([
	{
		nodeIndex: [6],
		kind: 1,
		declarationMode: 2,
		name: "skipped parent",
	},
]);

const TARGETED_TODO_DISCOVERY = annotateNodes([
	{
		nodeIndex: [7],
		kind: 1,
		declarationMode: 3,
		name: "todo parent",
	},
	{
		nodeIndex: [7, 0],
		kind: 1,
		declarationMode: 1,
		name: "todo nested child",
	},
]);

const TARGETED_TODO_LEAF_DISCOVERY = annotateNodes([
	{
		nodeIndex: [8],
		kind: 1,
		declarationMode: 3,
		name: "top-level todo leaf",
	},
]);

const TARGETED_HOOK_FAILURE_DISCOVERY = annotateNodes([
	{
		nodeIndex: [9],
		kind: 1,
		declarationMode: 1,
		name: "hook failure parent",
	},
	{
		nodeIndex: [9, 0],
		kind: 1,
		declarationMode: 1,
		name: "hook failure child",
	},
]);

const TARGETED_TRAP_DISCOVERY = annotateNodes([
	{
		nodeIndex: [10],
		kind: 1,
		declarationMode: 1,
		name: "trap parent",
	},
	{
		nodeIndex: [10, 0],
		kind: 1,
		declarationMode: 1,
		name: "trapping child",
	},
]);

const TARGETED_ONLY_DEPENDENCY_DISCOVERY = annotateNodes([
	{
		nodeIndex: [24],
		kind: 1,
		declarationMode: 1,
		name: "dependency only parent",
	},
	{
		nodeIndex: [24, 1],
		kind: 1,
		declarationMode: 1,
		name: "dependency only included dependent",
	},
]);

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

function summarizeStartResult(result) {
	return {
		ok: result.ok,
		discoveryOk: result.discoveryOk,
		planningOk: result.planningOk,
		discoveredTestCount: result.discoveredTestCount,
		workerCount: result.workerCount,
		topLevelNodes: result.topLevelNodes.map((node) => ({
			name: node.name,
			nodeIndex: node.nodeIndex,
			nodeId: node.nodeId,
			parentNodeId: node.parentNodeId,
			declarationOrder: node.declarationOrder,
			dependencyNodeIds: node.dependencyNodeIds,
			only: node.only,
			expectFailure: node.expectFailure,
		})),
		planIssues: result.planIssues,
		blocked: result.blocked.map((blocked) => ({
			name: blocked.node.name,
			nodeIndex: blocked.node.nodeIndex,
			nodeId: blocked.node.nodeId,
			parentNodeId: blocked.node.parentNodeId,
			declarationOrder: blocked.node.declarationOrder,
			dependencyNodeIds: blocked.node.dependencyNodeIds,
			issueType: blocked.issueType,
			dependencyIdentityKey: blocked.dependencyIdentityKey,
		})),
		branches: result.branches.map((branch) => ({
			root: {
				name: branch.root.name,
				nodeIndex: branch.root.nodeIndex,
				nodeId: branch.root.nodeId,
				parentNodeId: branch.root.parentNodeId,
				declarationOrder: branch.root.declarationOrder,
			},
			discoveryOk: branch.discovery.ok,
			discoveryNodes: branch.discovery.nodes.map((node) => ({
				name: node.name,
				nodeIndex: node.nodeIndex,
				nodeId: node.nodeId,
				parentNodeId: node.parentNodeId,
				declarationOrder: node.declarationOrder,
				dependencyNodeIds: node.dependencyNodeIds,
				only: node.only,
				expectFailure: node.expectFailure,
			})),
			executions: branch.executions.map((execution) => ({
				name: execution.node.name,
				nodeIndex: execution.node.nodeIndex,
				nodeId: execution.node.nodeId,
				ok: execution.ok,
				eventTypes: execution.events.map((event) => event.type),
			})),
		})),
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

	test("event registration replaces the active callback for each event slot", () => {
		const harness = createHarness(compiledNodeTestWasm);
		const staleFound = [];
		const activeFound = [];
		const staleStarts = [];
		const activeStarts = [];

		harness.onNodeFound((event) => {
			staleFound.push(event);
		});
		harness.onNodeFound((event) => {
			activeFound.push(event);
		});
		harness.onNodeStart((event) => {
			staleStarts.push(event);
		});
		harness.onNodeStart((event) => {
			activeStarts.push(event);
		});

		assert.equal(harness.discover([]), true);
		assert.equal(harness.run([0]), true);
		assert.deepEqual(staleFound, []);
		assert.deepEqual(activeFound, DISCOVERED_NODES.slice(0, 25));
		assert.deepEqual(staleStarts, []);
		assert.deepEqual(activeStarts, [{ nodeIndex: [0] }]);
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

		assert.equal(harness.run([]), true);
		assert.equal(harness.run([0]), true);
		assert.equal(harness.run([1]), false);
		assert.equal(harness.run([2]), false);
		assert.equal(harness.run([3]), true);
		assert.equal(harness.run([4]), true);
		assert.equal(harness.run([5]), true);
		assert.equal(harness.run([6]), true);
		assert.equal(harness.run([7]), true);
		assert.equal(harness.run([7, 0]), true);
		assert.equal(harness.run([8]), true);
		assert.equal(harness.run([4, 0]), true);
		assert.equal(harness.run([4, 1]), false);
		assert.equal(harness.run([9, 0]), false);
		assert.equal(harness.run([10, 0]), false);
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

	test("run(nodeIndex) treats [] as the root target and replays root hooks", () => {
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

		assert.equal(harness.run([]), true);
		assert.deepEqual(events, ROOT_TARGET_EVENTS);
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
		assert.deepEqual(found, DISCOVERED_NODES.slice(0, 25));

		found.length = 0;
		assert.equal(harness.discover([3]), true);
		assert.deepEqual(found, TARGETED_PARENT_DISCOVERY);

		found.length = 0;
		assert.equal(harness.discover([4]), true);
		assert.deepEqual(found, TARGETED_ONLY_DISCOVERY);

		found.length = 0;
		assert.equal(harness.discover([5]), true);
		assert.deepEqual(found, TARGETED_EXPECT_FAILURE_DISCOVERY);

		found.length = 0;
		assert.equal(harness.discover([6]), true);
		assert.deepEqual(found, TARGETED_SKIP_DISCOVERY);

		found.length = 0;
		assert.equal(harness.discover([7]), true);
		assert.deepEqual(found, TARGETED_TODO_DISCOVERY);

		found.length = 0;
		assert.equal(harness.discover([8]), true);
		assert.deepEqual(found, TARGETED_TODO_LEAF_DISCOVERY);

		found.length = 0;
		assert.equal(harness.discover([9]), true);
		assert.deepEqual(found, TARGETED_HOOK_FAILURE_DISCOVERY);

		found.length = 0;
		assert.equal(harness.discover([10]), true);
		assert.deepEqual(found, TARGETED_TRAP_DISCOVERY);

		found.length = 0;
		assert.equal(harness.discover([24]), true);
		assert.deepEqual(found, TARGETED_ONLY_DEPENDENCY_DISCOVERY);

		found.length = 0;
		assert.equal(harness.discover([11]), false);
		assert.deepEqual(found, []);

		found.length = 0;
		assert.equal(harness.discover([1]), false);
		assert.deepEqual(found, []);
		closeHarness(harness);
	});

	test("discover(nodeIndex) keeps skipped parents discoverable and todo descendants addressable", () => {
		const harness = createHarness(compiledNodeTestWasm);
		const found = [];

		harness.onNodeFound((event) => {
			found.push(event);
		});

		assert.equal(harness.discover([6]), true);
		assert.deepEqual(found, TARGETED_SKIP_DISCOVERY);

		found.length = 0;
		assert.equal(harness.discover([7]), true);
		assert.deepEqual(found, TARGETED_TODO_DISCOVERY);
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

		assert.equal(harness.run([7]), true);
		assert.equal(harness.run([8]), true);
		assert.deepEqual(events, []);
		closeHarness(harness);
	});

	test("run(nodeIndex) still executes descendants under todo parents normally", () => {
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

		assert.equal(harness.run([7, 0]), true);
		assert.deepEqual(events, TODO_NESTED_CHILD_EVENTS);
		closeHarness(harness);
	});

	test("discover(nodeIndex) prunes a trapping branch and recovers on the same harness", () => {
		const harness = createHarness(compiledNodeTestWasm);
		const found = [];

		harness.onNodeFound((event) => {
			found.push(event);
		});

		assert.equal(harness.discover([11]), false);
		assert.deepEqual(found, []);

		found.length = 0;
		assert.equal(harness.discover([3]), true);
		assert.deepEqual(found, TARGETED_PARENT_DISCOVERY);
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

		assert.equal(harness.run([9, 0]), false);
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

		assert.equal(harness.run([10, 0]), false);
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
		assert.equal(result.planningOk, false);
		assert.equal(result.ok, false);
		assert.equal(result.discoveredTestCount, 31);
		assert.equal(result.topLevelNodes.length, 25);
		assert.deepEqual(result.planIssues, [
			{
				type: "blocked-dependency",
				targetIdentityKey: "id:16",
				dependencyIdentityKey: "id:15",
			},
			{
				type: "missing-dependency",
				targetIdentityKey: "id:20",
				dependencyIdentityKey: "nodeId:19",
			},
			{
				type: "missing-dependency",
				targetIdentityKey: "id:22",
				dependencyIdentityKey: "nodeId:21",
			},
			{
				type: "blocked-dependency",
				targetIdentityKey: "id:24",
				dependencyIdentityKey: "id:23",
			},
			{
				type: "missing-dependency",
				targetIdentityKey: "id:25/id:27",
				dependencyIdentityKey: "nodeId:26",
			},
		]);
		assert.deepEqual(
			result.blocked.map((blocked) => ({
				name: blocked.node.name,
				dependencyNodeIds: blocked.node.dependencyNodeIds,
				issueType: blocked.issueType,
				dependencyIdentityKey: blocked.dependencyIdentityKey,
			})),
			[
				{
					name: "dependency blocked dependent",
					dependencyNodeIds: [15],
					issueType: "blocked-dependency",
					dependencyIdentityKey: "id:15",
				},
				{
					name: "dependency skipped dependent",
					dependencyNodeIds: [19],
					issueType: "missing-dependency",
					dependencyIdentityKey: "nodeId:19",
				},
				{
					name: "dependency todo dependent",
					dependencyNodeIds: [21],
					issueType: "missing-dependency",
					dependencyIdentityKey: "nodeId:21",
				},
				{
					name: "dependency unexpected pass dependent",
					dependencyNodeIds: [23],
					issueType: "blocked-dependency",
					dependencyIdentityKey: "id:23",
				},
				{
					name: "dependency only included dependent",
					dependencyNodeIds: [26],
					issueType: "missing-dependency",
					dependencyIdentityKey: "nodeId:26",
				},
			],
		);
		assert.deepEqual(
			result.topLevelNodes.map((node) => node.nodeId),
			[
				1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
				20, 21, 22, 23, 24, 25,
			],
		);
		assert.deepEqual(
			result.topLevelNodes.map((node) => node.declarationOrder),
			[
				0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
				19, 20, 21, 22, 23, 24,
			],
		);
		assert.equal(result.workerCount, 1);
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
			[[7, 0]],
		);
		assert.deepEqual(
			branchesByName
				.get("todo parent")
				.executions.map((execution) => execution.node.nodeId),
			[26],
		);
		assert.deepEqual(branchesByName.get("top-level todo leaf").executions, []);
		assert.deepEqual(
			branchesByName
				.get("dependency dependent")
				.discovery.nodes[0].dependencyNodeIds,
			[13],
		);
		assert.equal(
			branchesByName.get("expected failure test").discovery.nodes[0].expectFailure,
			true,
		);
		assert.equal(
			branchesByName
				.get("dependency expected failure prereq")
				.discovery.nodes[0].expectFailure,
			true,
		);
		assert.deepEqual(
			branchesByName
				.get("hook failure parent")
				.executions.map((execution) => [execution.node.nodeIndex, execution.ok]),
			[
				[[9], true],
				[[9, 0], false],
			],
		);
		assert.deepEqual(
			branchesByName
				.get("trap parent")
				.executions.map((execution) => [execution.node.nodeIndex, execution.ok]),
			[
				[[10], true],
				[[10, 0], false],
			],
		);
		assert.deepEqual(
			branchesByName.get("discovery trap parent").discovery.nodes,
			annotateNodes([
				{
					nodeIndex: [11],
					kind: 1,
					declarationMode: 1,
					name: "discovery trap parent",
				},
			]),
		);
		assert.deepEqual(
			branchesByName
				.get("discovery trap parent")
				.executions.map((execution) => [execution.node.nodeIndex, execution.ok]),
			[
				[[11], false],
			],
		);
		assert.deepEqual(
			branchesByName
				.get("parent test")
				.discovery.nodes.map((node) => [node.nodeId, node.parentNodeId]),
			[
				[4, 0],
				[26, 4],
			],
		);
		assert.equal(
			branchesByName.get("dependency prereq").executions[0].ok,
			true,
		);
		assert.equal(
			branchesByName.get("dependency dependent").executions[0].ok,
			true,
		);
		assert.equal(
			branchesByName.get("dependency failing prereq").executions[0].ok,
			false,
		);
		assert.deepEqual(
			branchesByName.get("dependency blocked dependent").executions,
			[],
		);
		assert.equal(
			branchesByName.get("dependency expected failure prereq").executions[0].ok,
			false,
		);
		assert.equal(
			branchesByName.get("dependency satisfied dependent").executions[0].ok,
			true,
		);
		assert.deepEqual(
			branchesByName.get("dependency skipped prereq").executions,
			[],
		);
		assert.deepEqual(
			branchesByName.get("dependency skipped dependent").executions,
			[],
		);
		assert.deepEqual(
			branchesByName.get("dependency todo prereq").executions,
			[],
		);
		assert.deepEqual(
			branchesByName.get("dependency todo dependent").executions,
			[],
		);
		assert.equal(
			branchesByName.get("dependency unexpected pass prereq").executions[0].ok,
			true,
		);
		assert.deepEqual(
			branchesByName.get("dependency unexpected pass dependent").executions,
			[],
		);
		assert.deepEqual(
			branchesByName
				.get("dependency only parent")
				.discovery.nodes.map((node) => ({
					name: node.name,
					only: node.only,
					dependencyNodeIds: node.dependencyNodeIds,
				})),
			[
				{
					name: "dependency only parent",
					only: false,
					dependencyNodeIds: [],
				},
				{
					name: "dependency only included dependent",
					only: true,
					dependencyNodeIds: [26],
				},
			],
		);
		assert.deepEqual(
			branchesByName
				.get("dependency only parent")
				.executions.map((execution) => [execution.node.nodeIndex, execution.ok]),
			[
				[[24], true],
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

	test("start() remains stable across repeated calls on the same harness", async () => {
		const harness = createHarness(compiledNodeTestWasm);

		const firstResult = await harness.start();
		const secondResult = await harness.start();

		assert.deepEqual(
			summarizeStartResult(secondResult),
			summarizeStartResult(firstResult),
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
