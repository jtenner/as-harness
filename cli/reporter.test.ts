import { expect, test } from "bun:test";
import {
	createHarnessRunReport,
	defaultRunReporter,
	type ReporterLogger,
} from "./reporter";

function createNode(name: string, declarationOrder = 0) {
	return {
		nodeIndex: [declarationOrder],
		nodeId: declarationOrder + 1,
		parentNodeId: 0,
		declarationOrder,
		sequenceMode: 0,
		only: false,
		expectFailure: false,
		kind: 1,
		declarationMode: 1,
		name,
	};
}

test("createHarnessRunReport preserves blocked nodes and planning issues", () => {
	const blockedNode = createNode("blocked test", 1);
	const result = {
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
				targetIdentityKey: "id:2",
				dependencyIdentityKey: "id:missing",
			},
		],
		blocked: [
			{
				node: blockedNode,
				issueType: "missing-dependency",
				dependencyIdentityKey: "id:missing",
			},
		],
		coverage: null,
	};

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
	const report = createHarnessRunReport({
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
				targetIdentityKey: "id:2",
				dependencyIdentityKey: "id:1",
			},
			{
				type: "missing-dependency",
				targetIdentityKey: "id:2",
				dependencyIdentityKey: "id:missing",
			},
		],
		blocked: [
			{
				node: createNode("blocked test", 1),
				issueType: "blocked-dependency",
				dependencyIdentityKey: "id:1",
			},
		],
		coverage: null,
	});

	defaultRunReporter.accept(report, {
		harnessName: "js",
		logger,
	});

	expect(messages.info).toEqual([]);
	expect(messages.error).toContain(
		"FAIL 0 passed, 0 failed, 1 blocked, 1 discovered with js.",
	);
	expect(messages.error).toContain("- blocked test");
	expect(messages.error).toContain("  blocked: blocked-dependency (id:1)");
	expect(messages.error).toContain(
		"  issue: missing-dependency (id:2 <- id:missing)",
	);
});
