import { expect, test } from "bun:test";
import {
	createHarnessRunReport,
	defaultRunReporter,
	type ReporterLogger,
} from "./reporter";
import type {
	HarnessRunMetadata,
	HarnessStartResult,
} from "../harness/shared/harness-types";

function createNode(name: string, declarationOrder = 0, expectFailure = false) {
	return {
		nodeIndex: [declarationOrder],
		nodeId: declarationOrder + 1,
		parentNodeId: 0,
		declarationOrder,
		sequenceMode: 0,
		preferredRunnerMode: 0,
		preferredFailurePolicy: 0,
		only: false,
		expectFailure,
		kind: 1,
		declarationMode: 1,
		name,
	};
}

function createStartResult(
	overrides: Partial<Omit<HarnessStartResult, "metadata">>,
	metadataOverrides: Partial<HarnessRunMetadata> = {},
): HarnessStartResult {
	const result = {
		ok: true,
		discoveryOk: true,
		planningOk: true,
		discoveredTestCount: 0,
		topLevelNodes: [createNode("root", 0)],
		workerCount: 1,
		branches: [],
		planIssues: [],
		blocked: [],
		coverage: null,
		...overrides,
	};

	return {
		...result,
		metadata: {
			ok: result.ok,
			discoveryOk: result.discoveryOk,
			planningOk: result.planningOk,
			discoveredTestCount: result.discoveredTestCount,
			topLevelNodes: result.topLevelNodes,
			workerCount: result.workerCount,
			planIssues: result.planIssues,
			blocked: result.blocked,
			coverage: result.coverage,
			...metadataOverrides,
		},
	};
}

test("createHarnessRunReport preserves blocked nodes and planning issues", () => {
	const blockedNode = createNode("blocked test", 1);
	const result = createStartResult({
		ok: false,
		discoveryOk: true,
		planningOk: false,
		discoveredTestCount: 2,
		topLevelNodes: [createNode("root", 0)],
		workerCount: 1,
		branches: [
			{
				root: createNode("root", 0),
				discovery: {
					ok: true,
					nodes: [createNode("root", 0), blockedNode],
					testCount: 1,
				},
				executions: [],
				ok: true,
			},
		],
		planIssues: [
			{
				type: "missing-dependency",
				issueLabel: "missing prerequisite",
				targetIdentityKey: "id:2",
				dependencyIdentityKey: "id:missing",
			},
		],
		blocked: [
			{
				node: blockedNode,
				issueType: "missing-dependency",
				issueLabel: "missing prerequisite",
				dependencyIdentityKey: "id:missing",
			},
		],
		coverage: null,
	});

	const report = createHarnessRunReport(result);

	expect(report.planningOk).toBe(false);
	expect(report.blockedTestCount).toBe(1);
	expect(report.blocked).toEqual(result.blocked);
	expect(report.planIssues).toEqual(result.planIssues);
});

test("defaultRunReporter prints blocked failures distinctly when blocked tests exist", () => {
	const messages = {
		error: [] as string[],
		info: [] as string[],
	};
	const logger: ReporterLogger = {
		error(message) {
			messages.error.push(message);
		},
		info(message) {
			messages.info.push(message);
		},
	};
	const report = createHarnessRunReport(
		createStartResult({
			ok: false,
			discoveryOk: true,
			planningOk: false,
			discoveredTestCount: 1,
			topLevelNodes: [createNode("root", 0)],
			workerCount: 1,
			branches: [
				{
					root: createNode("root", 0),
					discovery: {
						ok: true,
						nodes: [createNode("root", 0)],
						testCount: 0,
					},
					executions: [],
					ok: true,
				},
			],
			planIssues: [
				{
					type: "blocked-dependency",
					issueLabel: "blocked by prerequisite",
					targetIdentityKey: "id:2",
					dependencyIdentityKey: "id:1",
				},
				{
					type: "missing-dependency",
					issueLabel: "missing prerequisite",
					targetIdentityKey: "id:2",
					dependencyIdentityKey: "id:missing",
				},
			],
			blocked: [
				{
					node: createNode("blocked test", 1),
					issueType: "blocked-dependency",
					issueLabel: "blocked by prerequisite",
					dependencyIdentityKey: "id:1",
				},
			],
			coverage: null,
		}),
	);

	defaultRunReporter.accept(report, {
		harnessName: "js",
		logger,
	});

	expect(messages.info).toEqual([]);
	expect(messages.error).toContain(
		"FAIL 0 passed, 0 failed, 1 blocked, 1 discovered with js.",
	);
	expect(messages.error).toContain("- blocked test");
	expect(messages.error).toContain("  blocked: blocked by prerequisite (id:1)");
	expect(messages.error).toContain(
		"  issue: missing prerequisite (id:2 <- id:missing)",
	);
});

test("defaultRunReporter uses concise copy for cycle and missing-prerequisite outcomes", () => {
	const messages = {
		error: [] as string[],
		info: [] as string[],
	};
	const logger: ReporterLogger = {
		error(message) {
			messages.error.push(message);
		},
		info(message) {
			messages.info.push(message);
		},
	};
	const report = createHarnessRunReport(
		createStartResult({
			ok: false,
			discoveryOk: true,
			planningOk: false,
			discoveredTestCount: 2,
			topLevelNodes: [createNode("root", 0)],
			workerCount: 1,
			branches: [
				{
					root: createNode("root", 0),
					discovery: {
						ok: true,
						nodes: [createNode("root", 0)],
						testCount: 0,
					},
					executions: [],
					ok: true,
				},
			],
			planIssues: [
				{
					type: "dependency-cycle",
					issueLabel: "dependency cycle",
					targetIdentityKey: "id:1",
					dependencyIdentityKey: "",
				},
				{
					type: "missing-dependency",
					issueLabel: "missing prerequisite",
					targetIdentityKey: "id:2",
					dependencyIdentityKey: "nodeId:7",
				},
			],
			blocked: [
				{
					node: createNode("cycle member", 1),
					issueType: "dependency-cycle",
					issueLabel: "dependency cycle",
					dependencyIdentityKey: "",
				},
				{
					node: createNode("missing prereq", 2),
					issueType: "missing-dependency",
					issueLabel: "missing prerequisite",
					dependencyIdentityKey: "nodeId:7",
				},
			],
			coverage: null,
		}),
	);

	defaultRunReporter.accept(report, {
		harnessName: "js",
		logger,
	});

	expect(messages.error).toContain("- cycle member");
	expect(messages.error).toContain("  blocked: dependency cycle");
	expect(messages.error).toContain("- missing prereq");
	expect(messages.error).toContain(
		"  blocked: missing prerequisite (nodeId:7)",
	);
	expect(messages.error).toContain("  issue: dependency cycle (id:1)");
	expect(messages.error).toContain(
		"  issue: missing prerequisite (id:2 <- nodeId:7)",
	);
});

test("defaultRunReporter renders bail policy blocks with the shipped concise label", () => {
	const messages = {
		error: [] as string[],
		info: [] as string[],
	};
	const logger: ReporterLogger = {
		error(message) {
			messages.error.push(message);
		},
		info(message) {
			messages.info.push(message);
		},
	};
	const report = createHarnessRunReport(
		createStartResult({
			ok: false,
			discoveryOk: true,
			planningOk: true,
			discoveredTestCount: 2,
			topLevelNodes: [createNode("root", 0)],
			workerCount: 2,
			branches: [
				{
					root: createNode("root", 0),
					discovery: {
						ok: true,
						nodes: [createNode("root", 0)],
						testCount: 0,
					},
					executions: [],
					ok: false,
				},
			],
			planIssues: [
				{
					type: "bailed",
					issueLabel: "stopped after failure",
					targetIdentityKey: "id:4",
					dependencyIdentityKey: "id:3",
				},
			],
			blocked: [
				{
					node: createNode("bailed test", 1),
					issueType: "bailed",
					issueLabel: "stopped after failure",
					dependencyIdentityKey: "id:3",
				},
			],
			coverage: null,
		}),
	);

	defaultRunReporter.accept(report, {
		harnessName: "js",
		logger,
	});

	expect(messages.error).toContain("  blocked: stopped after failure (id:3)");
	expect(messages.error).toContain(
		"  issue: stopped after failure (id:4 <- id:3)",
	);
});

test("createHarnessRunReport counts expected-failure executions by semantic outcome", () => {
	const report = createHarnessRunReport(
		createStartResult({
			ok: false,
			discoveryOk: true,
			planningOk: true,
			discoveredTestCount: 2,
			topLevelNodes: [createNode("root", 0)],
			workerCount: 1,
			branches: [
				{
					root: createNode("root", 0),
					discovery: {
						ok: true,
						nodes: [createNode("root", 0)],
						testCount: 2,
					},
					executions: [
						{
							node: createNode("expected failure prereq", 1, true),
							ok: true,
							events: [],
						},
						{
							node: createNode("unexpected pass prereq", 2, true),
							ok: false,
							events: [],
						},
					],
					ok: false,
				},
			],
			planIssues: [],
			blocked: [],
			coverage: null,
		}),
	);

	expect(report.passedTestCount).toBe(1);
	expect(report.failedTestCount).toBe(1);
});

test("createHarnessRunReport relies on the required metadata snapshot", () => {
	const metadataRoot = createNode("metadata root", 9);
	const report = createHarnessRunReport(
		createStartResult(
			{
				ok: false,
				discoveryOk: false,
				planningOk: false,
				discoveredTestCount: 1,
				topLevelNodes: [createNode("top-level root", 0)],
				workerCount: 4,
			},
			{
				ok: true,
				discoveryOk: true,
				planningOk: true,
				discoveredTestCount: 7,
				topLevelNodes: [metadataRoot],
				workerCount: 2,
			},
		),
	);

	expect(report.ok).toBe(true);
	expect(report.discoveryOk).toBe(true);
	expect(report.planningOk).toBe(true);
	expect(report.discoveredTestCount).toBe(7);
	expect(report.workerCount).toBe(2);
	expect(report.topLevelNodes).toEqual([metadataRoot]);
});

test("defaultRunReporter explains unexpected-pass expectFailure executions", () => {
	const messages = {
		error: [] as string[],
		info: [] as string[],
	};
	const logger: ReporterLogger = {
		error(message) {
			messages.error.push(message);
		},
		info(message) {
			messages.info.push(message);
		},
	};
	const report = createHarnessRunReport(
		createStartResult({
			ok: false,
			discoveryOk: true,
			planningOk: true,
			discoveredTestCount: 1,
			topLevelNodes: [createNode("root", 0)],
			workerCount: 1,
			branches: [
				{
					root: createNode("root", 0),
					discovery: {
						ok: true,
						nodes: [createNode("root", 0)],
						testCount: 1,
					},
					executions: [
						{
							node: createNode("unexpected pass prereq", 1, true),
							ok: false,
							events: [],
						},
					],
					ok: false,
				},
			],
			planIssues: [],
			blocked: [],
			coverage: null,
		}),
	);

	defaultRunReporter.accept(report, {
		harnessName: "js",
		logger,
	});

	expect(messages.info).toEqual([]);
	expect(messages.error).toContain(
		"FAIL 0 passed, 1 failed, 1 discovered with js.",
	);
	expect(messages.error).toContain("- unexpected pass prereq");
	expect(messages.error).toContain(
		"  fail: expected failure passed unexpectedly",
	);
});

test("defaultRunReporter prioritizes discovery failures over execution and blocked details", () => {
	const messages = {
		error: [] as string[],
		info: [] as string[],
	};
	const logger: ReporterLogger = {
		error(message) {
			messages.error.push(message);
		},
		info(message) {
			messages.info.push(message);
		},
	};
	const report = createHarnessRunReport(
		createStartResult({
			ok: false,
			discoveryOk: false,
			planningOk: true,
			discoveredTestCount: 2,
			topLevelNodes: [createNode("root", 0)],
			workerCount: 1,
			branches: [
				{
					root: createNode("root", 0),
					discovery: {
						ok: false,
						nodes: [createNode("root", 0)],
						testCount: 0,
					},
					executions: [
						{
							node: createNode("should never print", 1),
							ok: false,
							events: [],
						},
					],
					ok: false,
				},
			],
			planIssues: [
				{
					type: "missing-dependency",
					issueLabel: "missing prerequisite",
					targetIdentityKey: "id:1",
					dependencyIdentityKey: "nodeId:2",
				},
			],
			blocked: [],
			coverage: null,
		}),
	);

	defaultRunReporter.accept(report, {
		harnessName: "js",
		logger,
	});

	expect(messages.error).toContain(
		"Discovery failed while traversing the test tree with js.",
	);
	expect(messages.error).toContain("- root");
	expect(messages.error).not.toContain("should never print");
	expect(messages.error).not.toContain("FAIL");
});

test("defaultRunReporter emits fallback failure text when a failing test has no fail message", () => {
	const messages = {
		error: [] as string[],
		info: [] as string[],
	};
	const logger: ReporterLogger = {
		error(message) {
			messages.error.push(message);
		},
		info(message) {
			messages.info.push(message);
		},
	};
	const report = createHarnessRunReport(
		createStartResult({
			ok: false,
			discoveryOk: true,
			planningOk: true,
			discoveredTestCount: 1,
			topLevelNodes: [createNode("root", 0)],
			workerCount: 1,
			branches: [
				{
					root: createNode("root", 0),
					discovery: {
						ok: true,
						nodes: [createNode("root", 0), createNode("silent fail", 1)],
						testCount: 1,
					},
					executions: [
						{
							node: createNode("silent fail", 1),
							ok: false,
							events: [],
						},
					],
					ok: false,
				},
			],
			planIssues: [],
			blocked: [],
			coverage: null,
		}),
	);

	defaultRunReporter.accept(report, {
		harnessName: "js",
		logger,
	});

	expect(messages.error).toContain(
		"FAIL 0 passed, 1 failed, 1 discovered with js.",
	);
	expect(messages.error).toContain("- silent fail");
	expect(messages.error).toContain("  fail: failed without a fail message");
});
