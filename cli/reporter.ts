import type {
	HarnessBlockedNode,
	HarnessBranchDiscovery,
	HarnessDiagnosticEvent,
	HarnessEvent,
	HarnessExecution,
	HarnessFailMessageEvent,
	HarnessLogEvent,
	HarnessNode,
	HarnessRunMetadata,
	HarnessPlanIssue,
	HarnessStartResult,
} from "../harness/shared/harness-types";

export type ReporterLogger = {
	error(message: string): void;
	info(message: string): void;
};

export type HarnessExecutionDetail =
	| {
			message: string;
			type: "failMessage";
	  }
	| {
			message: string;
			nodeIndex: number[] | null;
			source: "diagnostic" | "trace";
			type: "log";
			values: number[];
	  };

export type HarnessExecutionReport = {
	details: HarnessExecutionDetail[];
	events: HarnessEvent[];
	failureKind: number | null;
	node: HarnessNode;
	ok: boolean;
};

export type HarnessBranchReport = {
	discovery: HarnessBranchDiscovery;
	executions: HarnessExecutionReport[];
	ok: boolean;
	root: HarnessNode;
};

export type HarnessRunReport = {
	metadata: HarnessRunMetadata;
	branches: HarnessBranchReport[];
	blocked: HarnessBlockedNode[];
	blockedTestCount: number;
	discoveredTestCount: number;
	discoveryFailures: HarnessNode[];
	discoveryOk: boolean;
	failedTestCount: number;
	ok: boolean;
	passedTestCount: number;
	planIssues: HarnessPlanIssue[];
	planningOk: boolean;
	topLevelNodes: HarnessNode[];
	workerCount: number;
};

export type RunReporterContext = {
	harnessName: string;
	logger: ReporterLogger;
};

export type RunReporter = {
	accept(report: HarnessRunReport, context: RunReporterContext): void;
};

function toFailMessageDetail(
	event: HarnessFailMessageEvent,
): HarnessExecutionDetail {
	return {
		message: event.message,
		type: "failMessage",
	};
}

function toDiagnosticLogDetail(
	event: HarnessDiagnosticEvent,
): HarnessExecutionDetail {
	return {
		message: event.message,
		nodeIndex: event.nodeIndex.slice(),
		source: "diagnostic",
		type: "log",
		values: [],
	};
}

function toTraceLogDetail(event: HarnessLogEvent): HarnessExecutionDetail {
	return {
		message: event.message,
		nodeIndex: null,
		source: event.source,
		type: "log",
		values: event.values.slice(),
	};
}

function collectExecutionDetails(
	events: readonly HarnessEvent[],
): HarnessExecutionDetail[] {
	const details: HarnessExecutionDetail[] = [];

	for (const event of events) {
		switch (event.type) {
			case "failMessage":
				details.push(toFailMessageDetail(event.data));
				break;
			case "diagnostic":
				details.push(toDiagnosticLogDetail(event.data));
				break;
			case "log":
				details.push(toTraceLogDetail(event.data));
				break;
			default:
				break;
		}
	}

	return details;
}

function collectFailureKind(events: readonly HarnessEvent[]) {
	let failureKind: number | null = null;

	for (const event of events) {
		if (event.type === "nodeFail") {
			failureKind = event.data.failureKind;
		}
		if (event.type === "callbackFail") {
			failureKind = event.data.failureKind;
		}
	}

	return failureKind;
}

function toExecutionReport(
	execution: HarnessExecution,
): HarnessExecutionReport {
	return {
		details: collectExecutionDetails(execution.events),
		events: execution.events.slice(),
		failureKind: collectFailureKind(execution.events),
		node: execution.node,
		ok: execution.ok,
	};
}

export function createHarnessRunReport(
	result: HarnessStartResult,
): HarnessRunReport {
	const metadata: HarnessRunMetadata = result.metadata ?? {
		ok: result.ok,
		discoveryOk: result.discoveryOk,
		planningOk: result.planningOk,
		discoveredTestCount: result.discoveredTestCount,
		topLevelNodes: result.topLevelNodes.slice(),
		workerCount: result.workerCount,
		planIssues: result.planIssues.slice(),
		blocked: result.blocked.slice(),
		coverage: result.coverage,
	};
	const branches = result.branches.map((branch) => ({
		discovery: branch.discovery,
		executions: branch.executions.map(toExecutionReport),
		ok: branch.ok,
		root: branch.root,
	}));
	const discoveryFailures = branches
		.filter((branch) => !branch.discovery.ok)
		.map((branch) => branch.root);
	let passedTestCount = 0;
	let failedTestCount = 0;

	for (const branch of branches) {
		for (const execution of branch.executions) {
			if (execution.ok) {
				passedTestCount += 1;
				continue;
			}

			failedTestCount += 1;
		}
	}

	return {
		metadata,
		branches,
		blocked: metadata.blocked,
		blockedTestCount: metadata.blocked.length,
		discoveredTestCount: metadata.discoveredTestCount,
		discoveryFailures,
		discoveryOk: metadata.discoveryOk,
		failedTestCount,
		ok: metadata.ok,
		passedTestCount,
		planIssues: metadata.planIssues.slice(),
		planningOk: metadata.planningOk,
		topLevelNodes: metadata.topLevelNodes.slice(),
		workerCount: metadata.workerCount,
	};
}

function formatLogDetail(
	detail: Extract<HarnessExecutionDetail, { type: "log" }>,
) {
	if (detail.source === "trace" && detail.values.length > 0) {
		return `${detail.source}: ${detail.message} (${detail.values.join(", ")})`;
	}

	return `${detail.source}: ${detail.message}`;
}

function getFallbackFailureMessage(execution: HarnessExecutionReport) {
	if (execution.node.expectFailure) {
		return "expected failure passed unexpectedly";
	}

	return "failed without a fail message";
}

export const defaultRunReporter: RunReporter = {
	accept(report, context) {
		const { harnessName, logger } = context;

		if (report.discoveryFailures.length > 0) {
			logger.error(
				`Discovery failed while traversing the test tree with ${harnessName}.`,
			);

			for (const node of report.discoveryFailures) {
				logger.error(`- ${node.name}`);
			}

			return;
		}

		if (report.failedTestCount > 0 || report.blockedTestCount > 0) {
			logger.error(
				report.blockedTestCount > 0
					? `FAIL ${report.passedTestCount} passed, ${report.failedTestCount} failed, ${report.blockedTestCount} blocked, ${report.discoveredTestCount} discovered with ${harnessName}.`
					: `FAIL ${report.passedTestCount} passed, ${report.failedTestCount} failed, ${report.discoveredTestCount} discovered with ${harnessName}.`,
			);

			for (const branch of report.branches) {
				for (const execution of branch.executions) {
					if (execution.ok) {
						continue;
					}

					logger.error(`- ${execution.node.name}`);
					let sawFailMessage = false;

					for (const detail of execution.details) {
						if (detail.type === "failMessage") {
							sawFailMessage = true;
							logger.error(`  fail: ${detail.message}`);
							continue;
						}

						logger.error(`  ${formatLogDetail(detail)}`);
					}

					if (!sawFailMessage) {
						logger.error(`  fail: ${getFallbackFailureMessage(execution)}`);
					}
				}
			}

			for (const blocked of report.blocked) {
				logger.error(`- ${blocked.node.name}`);
				logger.error(
					blocked.dependencyIdentityKey.length > 0
						? `  blocked: ${blocked.issueType} (${blocked.dependencyIdentityKey})`
						: `  blocked: ${blocked.issueType}`,
				);
			}

			for (const issue of report.planIssues) {
				if (issue.type === "blocked-dependency") {
					continue;
				}

				logger.error(
					issue.dependencyIdentityKey.length > 0
						? `  issue: ${issue.type} (${issue.targetIdentityKey} <- ${issue.dependencyIdentityKey})`
						: `  issue: ${issue.type} (${issue.targetIdentityKey})`,
				);
			}

			return;
		}

		logger.info(
			`PASS ${report.passedTestCount} passed, ${report.failedTestCount} failed, ${report.discoveredTestCount} discovered with ${harnessName}.`,
		);
	},
};
