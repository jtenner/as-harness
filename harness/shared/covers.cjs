"use strict";

const COVER_POINT_TYPE_FUNCTION = 1;
const COVER_POINT_TYPE_BLOCK = 2;
const COVER_POINT_TYPE_EXPRESSION = 3;

function cloneCoveragePoint(point) {
	return {
		id: point.id >>> 0,
		file: typeof point.file === "string" ? point.file : "",
		line: typeof point.line === "number" ? point.line | 0 : 0,
		column: typeof point.column === "number" ? point.column | 0 : 0,
		coverType: typeof point.coverType === "number" ? point.coverType >>> 0 : 0,
	};
}

function compareCoveragePoints(left, right) {
	return (
		left.id === right.id &&
		left.file === right.file &&
		left.line === right.line &&
		left.column === right.column &&
		left.coverType === right.coverType
	);
}

function sortCoveragePoints(points) {
	return points.sort((left, right) => {
		const fileComparison = left.file.localeCompare(right.file);
		if (fileComparison !== 0) {
			return fileComparison;
		}

		if (left.line !== right.line) {
			return left.line - right.line;
		}

		if (left.column !== right.column) {
			return left.column - right.column;
		}

		if (left.coverType !== right.coverType) {
			return left.coverType - right.coverType;
		}

		return left.id - right.id;
	});
}

function cloneCoverageSnapshot(snapshot) {
	if (
		snapshot === null ||
		typeof snapshot !== "object" ||
		!Array.isArray(snapshot.points) ||
		!Array.isArray(snapshot.coveredIds)
	) {
		return {
			points: [],
			coveredIds: [],
		};
	}

	return {
		points: sortCoveragePoints(snapshot.points.map(cloneCoveragePoint)),
		coveredIds: [...new Set(snapshot.coveredIds.map((id) => id >>> 0))].sort(
			(left, right) => left - right,
		),
	};
}

function createCoverageCollector() {
	const points = new Map();
	const coveredIds = new Set();

	return {
		declare(point) {
			const normalizedPoint = cloneCoveragePoint(point);
			const existingPoint = points.get(normalizedPoint.id);
			if (
				existingPoint &&
				compareCoveragePoints(existingPoint, normalizedPoint)
			) {
				return;
			}

			if (!existingPoint) {
				points.set(normalizedPoint.id, normalizedPoint);
			}
		},
		hit(id) {
			coveredIds.add(id >>> 0);
		},
		snapshot() {
			return {
				points: sortCoveragePoints(
					[...points.values()].map(cloneCoveragePoint),
				),
				coveredIds: [...coveredIds].sort((left, right) => left - right),
			};
		},
		reset() {
			points.clear();
			coveredIds.clear();
		},
	};
}

function mergeCoverageSnapshots(snapshots) {
	const points = new Map();
	const coveredIds = new Set();

	for (const snapshot of snapshots) {
		const normalizedSnapshot = cloneCoverageSnapshot(snapshot);
		for (const point of normalizedSnapshot.points) {
			const existingPoint = points.get(point.id);
			if (!existingPoint) {
				points.set(point.id, point);
				continue;
			}

			if (!compareCoveragePoints(existingPoint, point)) {
				continue;
			}
		}

		for (const id of normalizedSnapshot.coveredIds) {
			coveredIds.add(id);
		}
	}

	return {
		points: sortCoveragePoints([...points.values()].map(cloneCoveragePoint)),
		coveredIds: [...coveredIds].sort((left, right) => left - right),
	};
}

function shouldIncludeCoverageFile(fileName) {
	return !/[\\/]\.as-harness-run-[^\\/]+[\\/]entry\.ts$/.test(fileName);
}

function formatPercent(covered, total) {
	if (total === 0) {
		return "100.00%";
	}

	return `${((covered / total) * 100).toFixed(2)}%`;
}

function pointTypeName(coverType) {
	switch (coverType) {
		case COVER_POINT_TYPE_FUNCTION:
			return "function";
		case COVER_POINT_TYPE_BLOCK:
			return "block";
		case COVER_POINT_TYPE_EXPRESSION:
			return "expression";
		default:
			return "unknown";
	}
}

function pointKey(point) {
	return `${point.file}:${point.line}:${point.column}`;
}

function createCoverageJSONReport(snapshot) {
	const normalizedSnapshot = cloneCoverageSnapshot(snapshot);
	const coveredIds = new Set(normalizedSnapshot.coveredIds);
	const files = new Map();

	for (const point of normalizedSnapshot.points) {
		if (!shouldIncludeCoverageFile(point.file)) {
			continue;
		}

		let fileEntry = files.get(point.file);
		if (!fileEntry) {
			fileEntry = {
				points: [],
			};
			files.set(point.file, fileEntry);
		}

		fileEntry.points.push({
			...point,
			covered: coveredIds.has(point.id),
		});
	}

	const report = {};
	for (const [fileName, fileEntry] of [...files.entries()].sort(
		([left], [right]) => left.localeCompare(right),
	)) {
		const points = fileEntry.points;
		const total = points.length;
		const coveredCount = points.filter((point) => point.covered).length;
		const typeTotals = {
			function: points.filter(
				(point) => point.coverType === COVER_POINT_TYPE_FUNCTION,
			),
			block: points.filter(
				(point) => point.coverType === COVER_POINT_TYPE_BLOCK,
			),
			expression: points.filter(
				(point) => point.coverType === COVER_POINT_TYPE_EXPRESSION,
			),
		};

		const fileReport = {
			overview: {
				id: fileName,
				uncovered: total - coveredCount,
				total,
				covered: formatPercent(coveredCount, total),
				types: {
					function: formatPercent(
						typeTotals.function.filter((point) => point.covered).length,
						typeTotals.function.length,
					),
					block: formatPercent(
						typeTotals.block.filter((point) => point.covered).length,
						typeTotals.block.length,
					),
					expression: formatPercent(
						typeTotals.expression.filter((point) => point.covered).length,
						typeTotals.expression.length,
					),
				},
			},
		};

		for (const point of points) {
			fileReport[pointKey(point)] = {
				covered: point.covered,
				id: point.id,
				file: point.file,
				line: point.line,
				column: point.column,
				coverType: point.coverType,
			};
		}

		report[fileName] = fileReport;
	}

	return report;
}

function createCoverageRows(snapshot) {
	const report = createCoverageJSONReport(snapshot);
	const rows = [];

	for (const fileName of Object.keys(report)) {
		const fileReport = report[fileName];
		for (const [key, value] of Object.entries(fileReport)) {
			if (key === "overview") {
				continue;
			}

			rows.push({
				file: value.file,
				line: value.line,
				column: value.column,
				coverType: pointTypeName(value.coverType),
				covered: value.covered,
				id: value.id,
			});
		}
	}

	return rows;
}

function listCoveragePointEntries(fileReport) {
	return Object.entries(fileReport)
		.filter(([key]) => key !== "overview")
		.map(([, value]) => value);
}

function createLineCoverage(entries) {
	const lines = new Map();
	for (const entry of entries) {
		const existing = lines.get(entry.line) || false;
		lines.set(entry.line, existing || entry.covered);
	}

	return [...lines.entries()]
		.sort(([left], [right]) => left - right)
		.map(([line, covered]) => ({
			line,
			covered,
			hits: covered ? 1 : 0,
		}));
}

function createFunctionCoverage(entries) {
	return entries
		.filter((entry) => entry.coverType === COVER_POINT_TYPE_FUNCTION)
		.map((entry) => ({
			name: `function_${entry.line}_${entry.column}`,
			line: entry.line,
			covered: entry.covered,
			hits: entry.covered ? 1 : 0,
		}));
}

function ratio(numerator, denominator) {
	if (denominator === 0) {
		return 1;
	}

	return numerator / denominator;
}

function formatRatio(numerator, denominator) {
	return ratio(numerator, denominator).toFixed(4);
}

function escapeXML(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

function stringifyCoverageText(snapshot) {
	const report = createCoverageJSONReport(snapshot);
	const fileNames = Object.keys(report);
	if (fileNames.length === 0) {
		return "Coverage: no instrumented user files matched the report filter.";
	}

	const lines = ["Coverage:"];
	for (const fileName of fileNames) {
		const fileReport = report[fileName];
		const { overview } = fileReport;
		lines.push(
			`${fileName} ${overview.covered} (${overview.total - overview.uncovered}/${overview.total})`,
		);
		lines.push(
			`  function ${overview.types.function}  block ${overview.types.block}  expression ${overview.types.expression}`,
		);

		const uncoveredPoints = Object.entries(fileReport)
			.filter(([key, value]) => key !== "overview" && value.covered === false)
			.map(([, value]) => value);
		for (const point of uncoveredPoints) {
			lines.push(
				`  uncovered ${point.line}:${point.column} ${pointTypeName(point.coverType)}`,
			);
		}
	}

	return lines.join("\n");
}

function stringifyCoverageCSV(snapshot) {
	const rows = createCoverageRows(snapshot);
	const lines = ["file,line,column,coverType,covered,id"];
	for (const row of rows) {
		lines.push(
			[
				JSON.stringify(row.file),
				row.line,
				row.column,
				row.coverType,
				row.covered ? "true" : "false",
				row.id,
			].join(","),
		);
	}

	return lines.join("\n");
}

function stringifyCoverageLCOV(snapshot) {
	const report = createCoverageJSONReport(snapshot);
	const lines = ["TN:as-harness"];

	for (const fileName of Object.keys(report)) {
		const fileReport = report[fileName];
		const entries = listCoveragePointEntries(fileReport);
		const lineCoverage = createLineCoverage(entries);
		const functionCoverage = createFunctionCoverage(entries);

		lines.push(`SF:${fileName}`);
		for (const fn of functionCoverage) {
			lines.push(`FN:${fn.line},${fn.name}`);
		}
		for (const fn of functionCoverage) {
			lines.push(`FNDA:${fn.hits},${fn.name}`);
		}
		lines.push(`FNF:${functionCoverage.length}`);
		lines.push(
			`FNH:${functionCoverage.filter((entry) => entry.covered).length}`,
		);
		for (const line of lineCoverage) {
			lines.push(`DA:${line.line},${line.hits}`);
		}
		lines.push(`LF:${lineCoverage.length}`);
		lines.push(`LH:${lineCoverage.filter((entry) => entry.covered).length}`);
		lines.push("end_of_record");
	}

	return lines.join("\n");
}

function toYAMLScalar(value) {
	if (typeof value === "string") {
		return JSON.stringify(value);
	}

	if (typeof value === "boolean") {
		return value ? "true" : "false";
	}

	return String(value);
}

function appendYAML(lines, key, value, indent) {
	const prefix = " ".repeat(indent);
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		lines.push(`${prefix}${key}: ${toYAMLScalar(value)}`);
		return;
	}

	lines.push(`${prefix}${key}:`);
	for (const [childKey, childValue] of Object.entries(value)) {
		appendYAML(lines, childKey, childValue, indent + 2);
	}
}

function stringifyCoverageYAML(snapshot) {
	const report = createCoverageJSONReport(snapshot);
	const lines = [];
	for (const [fileName, fileReport] of Object.entries(report)) {
		appendYAML(lines, fileName, fileReport, 0);
	}

	return lines.join("\n");
}

function stringifyCoverageCobertura(snapshot) {
	const report = createCoverageJSONReport(snapshot);
	const classes = Object.keys(report).map((fileName) => {
		const fileReport = report[fileName];
		const entries = listCoveragePointEntries(fileReport);
		const lineCoverage = createLineCoverage(entries);
		const functionCoverage = createFunctionCoverage(entries);
		const coveredLines = lineCoverage.filter((entry) => entry.covered).length;

		return {
			fileName,
			lineCoverage,
			functionCoverage,
			linesValid: lineCoverage.length,
			linesCovered: coveredLines,
			lineRate: formatRatio(coveredLines, lineCoverage.length),
		};
	});

	const totalLinesValid = classes.reduce(
		(sum, fileReport) => sum + fileReport.linesValid,
		0,
	);
	const totalLinesCovered = classes.reduce(
		(sum, fileReport) => sum + fileReport.linesCovered,
		0,
	);
	const lines = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		[
			`<coverage lines-covered="${totalLinesCovered}"`,
			`lines-valid="${totalLinesValid}"`,
			`line-rate="${formatRatio(totalLinesCovered, totalLinesValid)}"`,
			'branches-covered="0"',
			'branches-valid="0"',
			'branch-rate="1.0000"',
			'complexity="0"',
			'version="as-harness"',
			'timestamp="0">',
		].join(" "),
		"  <sources>",
		"    <source>.</source>",
		"  </sources>",
		[
			"  <packages>",
			`    <package name="as-harness" line-rate="${formatRatio(totalLinesCovered, totalLinesValid)}" branch-rate="1.0000" complexity="0">`,
			"      <classes>",
		].join("\n"),
	];

	for (const fileReport of classes) {
		lines.push(
			`        <class name="${escapeXML(fileReport.fileName)}" filename="${escapeXML(fileReport.fileName)}" line-rate="${fileReport.lineRate}" branch-rate="1.0000" complexity="0">`,
		);
		lines.push("          <methods>");
		for (const fn of fileReport.functionCoverage) {
			lines.push(
				`            <method name="${escapeXML(fn.name)}" signature="" line-rate="${formatRatio(fn.hits, 1)}" branch-rate="1.0000">`,
			);
			lines.push("              <lines>");
			lines.push(
				`                <line number="${fn.line}" hits="${fn.hits}" branch="false"/>`,
			);
			lines.push("              </lines>");
			lines.push("            </method>");
		}
		lines.push("          </methods>");
		lines.push("          <lines>");
		for (const line of fileReport.lineCoverage) {
			lines.push(
				`            <line number="${line.line}" hits="${line.hits}" branch="false"/>`,
			);
		}
		lines.push("          </lines>");
		lines.push("        </class>");
	}

	lines.push("      </classes>");
	lines.push("    </package>");
	lines.push("  </packages>");
	lines.push("</coverage>");

	return lines.join("\n");
}

function stringifyCoverage(snapshot, format) {
	switch (format) {
		case "json":
			return JSON.stringify(createCoverageJSONReport(snapshot), null, 2);
		case "yaml":
			return stringifyCoverageYAML(snapshot);
		case "csv":
			return stringifyCoverageCSV(snapshot);
		case "lcov":
			return stringifyCoverageLCOV(snapshot);
		case "cobertura":
			return stringifyCoverageCobertura(snapshot);
		case "text":
		case undefined:
			return stringifyCoverageText(snapshot);
		default:
			throw new Error(
				`Unsupported coverage format: ${format}. Supported formats: text, json, yaml, csv, lcov, cobertura.`,
			);
	}
}

module.exports = {
	COVER_POINT_TYPE_BLOCK,
	COVER_POINT_TYPE_EXPRESSION,
	COVER_POINT_TYPE_FUNCTION,
	cloneCoverageSnapshot,
	createCoverageCollector,
	createCoverageJSONReport,
	mergeCoverageSnapshots,
	stringifyCoverage,
};
