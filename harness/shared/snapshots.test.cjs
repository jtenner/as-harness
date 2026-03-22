const assert = require("node:assert/strict");
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
	loadSnapshotManifest,
	parseSnapshotFile,
	renderSnapshotFile,
	resolveSnapshotPath,
	resolveSnapshotRelativePath,
} = require("./snapshots.cjs");

test("resolveSnapshotRelativePath mirrors the source tree under __snapshots__", () => {
	assert.equal(
		resolveSnapshotRelativePath("tests/math/add.test.ts"),
		"tests/math/add.test.snap",
	);
	assert.equal(
		resolveSnapshotRelativePath("nested\\windows\\suite.spec.ts"),
		"nested/windows/suite.spec.snap",
	);
});

test("resolveSnapshotPath anchors snapshots under the project root", () => {
	assert.equal(
		resolveSnapshotPath("/workspace/project", "tests/math/add.test.ts"),
		path.join(
			"/workspace/project",
			"__snapshots__",
			"tests",
			"math",
			"add.test.snap",
		),
	);
});

test("resolveSnapshotRelativePath rejects absolute and escaping paths", () => {
	assert.throws(
		() => resolveSnapshotRelativePath("../outside.test.ts"),
		/artifact paths must stay within the project root/,
	);
	assert.throws(
		() => resolveSnapshotRelativePath("/workspace/outside.test.ts"),
		/artifact paths must stay within the project root/,
	);
	assert.throws(
		() => resolveSnapshotRelativePath("C:/workspace/outside.test.ts"),
		/artifact paths must stay within the project root/,
	);
});

test("parseSnapshotFile reads as-pect-style export-map entries as unmatched", () => {
	const entries = parseSnapshotFile(
		[
			"exports[`adds~(0)`] = `1 + 1 = 2`;",
			"",
			"exports[`adds~(1)`] = `2 + 2 = 4`;",
			"",
		].join("\n"),
	);

	assert.deepEqual(entries, [
		{ key: "adds~(0)", value: "1 + 1 = 2", matched: false },
		{ key: "adds~(1)", value: "2 + 2 = 4", matched: false },
	]);
});

test("renderSnapshotFile escapes template literal control characters", () => {
	const sourceText = renderSnapshotFile([
		{
			key: "line~(0)",
			value: "backtick ` slash \\ dollar ${ value",
		},
	]);

	assert.equal(
		sourceText,
		"exports[`line~(0)`] = `backtick \\` slash \\\\ dollar \\${ value`;\n",
	);
	assert.deepEqual(parseSnapshotFile(sourceText), [
		{
			key: "line~(0)",
			value: "backtick ` slash \\ dollar ${ value",
			matched: false,
		},
	]);
});

test("parseSnapshotFile rejects duplicate keys", () => {
	assert.throws(
		() =>
			parseSnapshotFile(
				["exports[`same~(0)`] = `a`;", "exports[`same~(0)`] = `b`;"].join("\n"),
			),
		/duplicate snapshot key: same~\(0\)/,
	);
});

test("loadSnapshotManifest recursively groups snapshot files by relative path", () => {
	const projectRoot = mkdtempSync(path.join(tmpdir(), "as-harness-snapshots-"));

	try {
		const nestedDirectory = path.join(
			projectRoot,
			"__snapshots__",
			"tests",
			"math",
		);
		mkdirSync(nestedDirectory, { recursive: true });
		writeFileSync(
			path.join(projectRoot, "__snapshots__", "root.test.snap"),
			"exports[`root~(0)`] = `root value`;\n",
			"utf8",
		);
		writeFileSync(
			path.join(nestedDirectory, "add.test.snap"),
			[
				"exports[`adds~(0)`] = `1 + 1 = 2`;",
				"",
				"exports[`adds~(1)`] = `2 + 2 = 4`;",
				"",
			].join("\n"),
			"utf8",
		);

		const manifest = loadSnapshotManifest(projectRoot);

		assert.deepEqual(
			manifest.files.map((fileState) => fileState.relativeSnapshotPath),
			["root.test.snap", "tests/math/add.test.snap"],
		);
		assert.equal(
			manifest.filesByRelativePath
				.get("root.test.snap")
				.entriesByKey.get("root~(0)").value,
			"root value",
		);
		assert.equal(
			manifest.filesByRelativePath
				.get("tests/math/add.test.snap")
				.entriesByKey.get("adds~(1)").matched,
			false,
		);
	} finally {
		rmSync(projectRoot, { force: true, recursive: true });
	}
});

test("loadSnapshotManifest tolerates projects without snapshot files", () => {
	const projectRoot = mkdtempSync(
		path.join(tmpdir(), "as-harness-no-snapshots-"),
	);

	try {
		const manifest = loadSnapshotManifest(projectRoot);
		assert.deepEqual(manifest.files, []);
		assert.equal(manifest.filesByRelativePath.size, 0);
	} finally {
		rmSync(projectRoot, { force: true, recursive: true });
	}
});
