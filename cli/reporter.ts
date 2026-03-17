import type {
	HarnessBranchDiscovery,
	HarnessDiagnosticEvent,
	HarnessEvent,
	HarnessExecution,
	HarnessFailMessageEvent,
	HarnessLogEvent,
	HarnessNode,
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
	branches: HarnessBranchReport[];
	discoveredTestCount: number;
	discoveryFailures: HarnessNode[];
	discoveryOk: boolean;
	failedTestCount: number;
	ok: boolean;
	passedTestCount: number;
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
		branches,
		discoveredTestCount: result.discoveredTestCount,
		discoveryFailures,
		discoveryOk: result.discoveryOk,
		failedTestCount,
		ok: result.ok,
		passedTestCount,
		topLevelNodes: result.topLevelNodes.slice(),
		workerCount: result.workerCount,
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

		if (report.failedTestCount > 0) {
			logger.error(
				`FAIL ${report.passedTestCount} passed, ${report.failedTestCount} failed, ${report.discoveredTestCount} discovered with ${harnessName}.`,
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
						logger.error("  fail: failed without a fail message");
					}
				}
			}

			return;
		}

		logger.info(
			`PASS ${report.passedTestCount} passed, ${report.failedTestCount} failed, ${report.discoveredTestCount} discovered with ${harnessName}.`,
		);
	},
};
