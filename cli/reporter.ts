import type {
	HarnessBlockedNode,
	HarnessDebugEvent,
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
	  }
	| {
			crumbs: HarnessDebugEvent["crumbs"];
			engineStack: string[];
			location: HarnessDebugEvent["location"];
			message: string;
			source: HarnessDebugEvent["source"];
			type: "debug";
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

function toDebugDetail(event: HarnessDebugEvent): HarnessExecutionDetail {
	return {
		crumbs: event.crumbs.map((crumb) => ({
			...crumb,
			nodeIndex: crumb.nodeIndex.slice(),
		})),
		engineStack: event.engineStack.slice(),
		location:
			event.location === null
				? null
				: {
						fileName: event.location.fileName,
						line: event.location.line,
						column: event.location.column,
					},
		message: event.message,
		source: event.source,
		type: "debug",
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
			case "debug":
				details.push(toDebugDetail(event.data));
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
	const metadata: HarnessRunMetadata = result.metadata;
	const branches = result.branches.map((branch) => ({
		discovery: branch.discovery,
		executions: branch.executions.map(toExecutionReport),
		ok: branch.ok,
		root: branch.root,
	}));
	const blocked = metadata.blocked.slice();
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
		blocked,
		blockedTestCount: blocked.length,
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

function formatLocation(location: HarnessDebugEvent["location"]) {
	if (
		location === null ||
		((typeof location.fileName !== "string" ||
			location.fileName.length === 0) &&
			location.line === 0 &&
			location.column === 0)
	) {
		return "";
	}

	const fileName =
		typeof location.fileName === "string" && location.fileName.length > 0
			? location.fileName
			: "<unknown>";
	return `${fileName}:${location.line}:${location.column}`;
}

function formatLogDetail(
	detail: Extract<HarnessExecutionDetail, { type: "log" }>,
) {
	if (detail.source === "trace" && detail.values.length > 0) {
		return `${detail.source}: ${detail.message} (${detail.values.join(", ")})`;
	}

	return `${detail.source}: ${detail.message}`;
}

function formatDebugDetailLines(
	detail: Extract<HarnessExecutionDetail, { type: "debug" }>,
) {
	const lines = [];
	const valueSuffix =
		detail.source === "trace" && detail.values.length > 0
			? ` (${detail.values.join(", ")})`
			: "";
	const formattedLocation = formatLocation(detail.location);

	lines.push(
		formattedLocation.length > 0
			? `${detail.source}: ${detail.message}${valueSuffix} at ${formattedLocation}`
			: `${detail.source}: ${detail.message}${valueSuffix}`,
	);

	for (const crumb of detail.crumbs) {
		const crumbLocation =
			typeof crumb.sourceFile === "string" && crumb.sourceFile.length > 0
				? `${crumb.sourceFile}:${crumb.sourceLine}:${crumb.sourceColumn}`
				: "<unknown>:0:0";
		lines.push(
			`  crumb: ${crumb.name} kind=${crumb.kind} hook=${crumb.hookKind} nodeKind=${crumb.nodeKind} at ${crumbLocation} [${crumb.nodeIndex.join(", ")}]`,
		);
	}

	for (const stackLine of detail.engineStack) {
		lines.push(`  stack: ${stackLine}`);
	}

	return lines;
}

function getFallbackFailureMessage(execution: HarnessExecutionReport) {
	if (execution.node.expectFailure) {
		return "expected failure passed unexpectedly";
	}

	return "failed without a fail message";
}

function formatIssueLabel(type: string) {
	switch (type) {
		case "blocked-dependency":
			return "blocked by prerequisite";
		case "missing-dependency":
			return "missing prerequisite";
		case "dependency-cycle":
			return "dependency cycle";
		case "invalid-constraint":
			return "invalid constraint";
		case "ignored-hint":
			return "ignored hint";
		default:
			return type;
	}
}

function formatBlockedMessage(blocked: HarnessBlockedNode) {
	const label =
		typeof blocked.issueLabel === "string" && blocked.issueLabel.length > 0
			? blocked.issueLabel
			: formatIssueLabel(blocked.issueType);
	return blocked.dependencyIdentityKey.length > 0
		? `  blocked: ${label} (${blocked.dependencyIdentityKey})`
		: `  blocked: ${label}`;
}

function formatPlanIssueMessage(issue: HarnessPlanIssue) {
	const label =
		typeof issue.issueLabel === "string" && issue.issueLabel.length > 0
			? issue.issueLabel
			: formatIssueLabel(issue.type);
	if (
		typeof issue.hintName === "string" &&
		issue.hintName.length > 0 &&
		typeof issue.hintValue === "number"
	) {
		return `  issue: ${label} (${issue.targetIdentityKey}, ${issue.hintName}=${issue.hintValue})`;
	}
	return issue.dependencyIdentityKey.length > 0
		? `  issue: ${label} (${issue.targetIdentityKey} <- ${issue.dependencyIdentityKey})`
		: `  issue: ${label} (${issue.targetIdentityKey})`;
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

						if (detail.type === "log") {
							logger.error(`  ${formatLogDetail(detail)}`);
							continue;
						}

						for (const line of formatDebugDetailLines(detail)) {
							logger.error(`  ${line}`);
						}
					}

					if (!sawFailMessage) {
						logger.error(`  fail: ${getFallbackFailureMessage(execution)}`);
					}
				}
			}

			for (const blocked of report.blocked) {
				logger.error(`- ${blocked.node.name}`);
				logger.error(formatBlockedMessage(blocked));
			}

			for (const issue of report.planIssues) {
				if (issue.type === "blocked-dependency") {
					continue;
				}

				logger.error(formatPlanIssueMessage(issue));
			}

			return;
		}

		logger.info(
			`PASS ${report.passedTestCount} passed, ${report.failedTestCount} failed, ${report.discoveredTestCount} discovered with ${harnessName}.`,
		);

		for (const issue of report.planIssues) {
			logger.info(formatPlanIssueMessage(issue));
		}
	},
};
