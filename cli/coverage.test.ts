import { expect, test } from "bun:test";
import {
	createCoverageJSONReport,
	mergeCoverageSnapshots,
	stringifyCoverage,
} from "../harness/shared/covers.cjs";

test("mergeCoverageSnapshots unions points and covered ids deterministically", () => {
	const merged = mergeCoverageSnapshots([
		{
			points: [
				{
					id: 2,
					file: "/tmp/suite.ts",
					line: 4,
					column: 3,
					coverType: 2,
				},
			],
			coveredIds: [],
		},
		{
			points: [
				{
					id: 1,
					file: "/tmp/suite.ts",
					line: 2,
					column: 1,
					coverType: 1,
				},
			],
			coveredIds: [2],
		},
	]);

	expect(merged.points).toEqual([
		{
			id: 1,
			file: "/tmp/suite.ts",
			line: 2,
			column: 1,
			coverType: 1,
		},
		{
			id: 2,
			file: "/tmp/suite.ts",
			line: 4,
			column: 3,
			coverType: 2,
		},
	]);
	expect(merged.coveredIds).toEqual([2]);
});

test("createCoverageJSONReport groups points by file with overview metadata", () => {
	const report = createCoverageJSONReport({
		points: [
			{
				id: 1,
				file: "/tmp/suite.ts",
				line: 2,
				column: 1,
				coverType: 1,
			},
			{
				id: 2,
				file: "/tmp/suite.ts",
				line: 4,
				column: 3,
				coverType: 2,
			},
		],
		coveredIds: [1],
	});

	expect(report["/tmp/suite.ts"]?.overview).toEqual({
		id: "/tmp/suite.ts",
		uncovered: 1,
		total: 2,
		covered: "50.00%",
		types: {
			function: "100.00%",
			block: "0.00%",
			expression: "100.00%",
		},
	});
	expect(report["/tmp/suite.ts"]?.["/tmp/suite.ts:4:3"]).toEqual({
		covered: false,
		id: 2,
		file: "/tmp/suite.ts",
		line: 4,
		column: 3,
		coverType: 2,
	});
});

test("stringifyCoverage renders text, json, yaml, csv, lcov, and cobertura output", () => {
	const snapshot = {
		points: [
			{
				id: 7,
				file: "/tmp/suite.ts",
				line: 9,
				column: 2,
				coverType: 3,
			},
		],
		coveredIds: [],
	};

	expect(stringifyCoverage(snapshot, "text")).toContain("Coverage:");
	expect(stringifyCoverage(snapshot, "json")).toContain('"overview"');
	expect(stringifyCoverage(snapshot, "yaml")).toContain("overview:");
	expect(stringifyCoverage(snapshot, "csv")).toContain(
		"file,line,column,coverType,covered,id",
	);
	expect(stringifyCoverage(snapshot, "lcov")).toContain("TN:as-harness");
	expect(stringifyCoverage(snapshot, "lcov")).toContain("SF:/tmp/suite.ts");
	expect(stringifyCoverage(snapshot, "cobertura")).toContain("<coverage ");
	expect(stringifyCoverage(snapshot, "cobertura")).toContain(
		'filename="/tmp/suite.ts"',
	);
});
