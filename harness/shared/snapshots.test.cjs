const assert = require("node:assert/strict");
const {
	mkdtempSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
	FIXTURE_ROOT_DIRECTORY,
	createSnapshotKey,
	finalizeSnapshotManifest,
	getSnapshotKeyBaseName,
	loadSnapshotManifest,
	matchSnapshotEntry,
	parseSnapshotFile,
	readFixtureText,
	renderSnapshotFile,
	resolveFixturePath,
	resolveFixtureRelativePath,
	resolveSnapshotFileState,
	resolveSnapshotPath,
	resolveSnapshotRelativePath,
	upsertSnapshotEntry,
} = require("./snapshots.cjs");

function createSnapshotProject() {
	const projectRoot = mkdtempSync(path.join(tmpdir(), "as-harness-snapshots-"));
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
	return projectRoot;
}

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

test("createSnapshotKey and getSnapshotKeyBaseName follow the grouped name~(number) contract", () => {
	assert.equal(createSnapshotKey("adds two values", 0), "adds two values~(0)");
	assert.equal(
		getSnapshotKeyBaseName("adds two values~(1)"),
		"adds two values",
	);
	assert.equal(getSnapshotKeyBaseName("plain name"), "plain name");
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

test("resolveFixtureRelativePath mirrors the source tree under __fixtures__", () => {
	assert.equal(
		resolveFixtureRelativePath("tests/math/add.test.ts", "cases/alpha.txt"),
		"tests/math/cases/alpha.txt",
	);
	assert.equal(
		resolveFixturePath(
			"/workspace/project",
			"nested\\windows\\suite.spec.ts",
			"fixtures\\alpha.txt",
		),
		path.join(
			"/workspace/project",
			FIXTURE_ROOT_DIRECTORY,
			"nested",
			"windows",
			"fixtures",
			"alpha.txt",
		),
	);
});

test("readFixtureText reads UTF-8 fixture content under the mirrored project root", () => {
	const projectRoot = mkdtempSync(path.join(tmpdir(), "as-harness-fixtures-"));

	try {
		const fixturePath = path.join(
			projectRoot,
			FIXTURE_ROOT_DIRECTORY,
			"tests",
			"math",
			"cases",
			"alpha.txt",
		);
		mkdirSync(path.dirname(fixturePath), { recursive: true });
		writeFileSync(fixturePath, "fixture text\n", "utf8");

		assert.equal(
			readFixtureText(projectRoot, "tests/math/add.test.ts", "cases/alpha.txt"),
			"fixture text\n",
		);
	} finally {
		rmSync(projectRoot, { force: true, recursive: true });
	}
});

test("resolveSnapshotRelativePath rejects absolute and escaping paths", () => {
	assert.equal(
		resolveSnapshotRelativePath("../outside.test.ts"),
		"outside.test.snap",
	);
	assert.equal(
		resolveSnapshotRelativePath("/workspace/outside.test.ts"),
		"outside.test.snap",
	);
	assert.equal(
		resolveSnapshotRelativePath("C:/workspace/outside.test.ts"),
		"outside.test.snap",
	);
	assert.throws(
		() =>
			resolveFixtureRelativePath(
				"tests/math/add.test.ts",
				"../outside/alpha.txt",
			),
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
	const projectRoot = createSnapshotProject();

	try {
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

test("resolveSnapshotFileState finds preloaded files by source file path", () => {
	const projectRoot = createSnapshotProject();

	try {
		const manifest = loadSnapshotManifest(projectRoot);
		assert.equal(
			resolveSnapshotFileState(manifest, "tests/math/add.test.ts")
				.relativeSnapshotPath,
			"tests/math/add.test.snap",
		);
		assert.equal(resolveSnapshotFileState(manifest, "missing.test.ts"), null);
	} finally {
		rmSync(projectRoot, { force: true, recursive: true });
	}
});

test("matchSnapshotEntry confirms exact matches and untouched files stay out of finalize failures", () => {
	const projectRoot = createSnapshotProject();

	try {
		const manifest = loadSnapshotManifest(projectRoot);
		assert.deepEqual(
			matchSnapshotEntry(
				manifest,
				"tests/math/add.test.ts",
				"adds~(0)",
				"1 + 1 = 2",
			),
			{
				ok: true,
				outcome: "match",
				relativeSnapshotPath: "tests/math/add.test.snap",
				key: "adds~(0)",
				expectedValue: "1 + 1 = 2",
			},
		);
		assert.deepEqual(
			matchSnapshotEntry(
				manifest,
				"tests/math/add.test.ts",
				"adds~(1)",
				"2 + 2 = 4",
			),
			{
				ok: true,
				outcome: "match",
				relativeSnapshotPath: "tests/math/add.test.snap",
				key: "adds~(1)",
				expectedValue: "2 + 2 = 4",
			},
		);
		assert.deepEqual(finalizeSnapshotManifest(manifest), {
			ok: true,
			staleEntries: [],
		});
	} finally {
		rmSync(projectRoot, { force: true, recursive: true });
	}
});

test("matchSnapshotEntry reports missing files and entries without inventing synthetic matches", () => {
	const projectRoot = createSnapshotProject();

	try {
		const manifest = loadSnapshotManifest(projectRoot);
		assert.deepEqual(
			matchSnapshotEntry(
				manifest,
				"tests/missing/source.test.ts",
				"missing~(0)",
				"value",
			),
			{
				ok: false,
				outcome: "missing-snapshot-file",
				relativeSnapshotPath: "tests/missing/source.test.snap",
				key: "missing~(0)",
				actualValue: "value",
			},
		);
		assert.deepEqual(
			matchSnapshotEntry(
				manifest,
				"tests/math/add.test.ts",
				"missing~(0)",
				"value",
			),
			{
				ok: false,
				outcome: "missing-snapshot-entry",
				relativeSnapshotPath: "tests/math/add.test.snap",
				key: "missing~(0)",
				actualValue: "value",
			},
		);
		assert.deepEqual(finalizeSnapshotManifest(manifest), {
			ok: true,
			staleEntries: [],
		});
	} finally {
		rmSync(projectRoot, { force: true, recursive: true });
	}
});

test("matchSnapshotEntry treats mismatched entries as consumed so finalize only reports truly untouched entries", () => {
	const projectRoot = createSnapshotProject();

	try {
		const manifest = loadSnapshotManifest(projectRoot);
		assert.deepEqual(
			matchSnapshotEntry(
				manifest,
				"tests/math/add.test.ts",
				"adds~(0)",
				"wrong value",
			),
			{
				ok: false,
				outcome: "mismatch",
				relativeSnapshotPath: "tests/math/add.test.snap",
				key: "adds~(0)",
				expectedValue: "1 + 1 = 2",
				actualValue: "wrong value",
			},
		);
		assert.deepEqual(finalizeSnapshotManifest(manifest), {
			ok: false,
			staleEntries: [
				{
					relativeSnapshotPath: "tests/math/add.test.snap",
					key: "adds~(1)",
					expectedValue: "2 + 2 = 4",
				},
			],
		});
	} finally {
		rmSync(projectRoot, { force: true, recursive: true });
	}
});

test("finalizeSnapshotManifest only reports stale entries inside touched execution-name groups", () => {
	const projectRoot = createSnapshotProject();

	try {
		const manifest = loadSnapshotManifest(projectRoot);
		assert.deepEqual(
			matchSnapshotEntry(
				manifest,
				"tests/math/add.test.ts",
				"adds~(0)",
				"1 + 1 = 2",
			),
			{
				ok: true,
				outcome: "match",
				relativeSnapshotPath: "tests/math/add.test.snap",
				key: "adds~(0)",
				expectedValue: "1 + 1 = 2",
			},
		);
		assert.deepEqual(
			upsertSnapshotEntry(
				manifest,
				"tests/math/add.test.ts",
				"other test~(0)",
				"value",
			).outcome,
			"added-entry",
		);
		assert.deepEqual(finalizeSnapshotManifest(manifest), {
			ok: false,
			staleEntries: [
				{
					relativeSnapshotPath: "tests/math/add.test.snap",
					key: "adds~(1)",
					expectedValue: "2 + 2 = 4",
				},
			],
		});
	} finally {
		rmSync(projectRoot, { force: true, recursive: true });
	}
});

test("finalizeSnapshotManifest removes stale touched entries in update mode", () => {
	const projectRoot = createSnapshotProject();

	try {
		const manifest = loadSnapshotManifest(projectRoot);
		assert.deepEqual(
			matchSnapshotEntry(
				manifest,
				"tests/math/add.test.ts",
				"adds~(0)",
				"1 + 1 = 2",
			).ok,
			true,
		);
		assert.deepEqual(
			finalizeSnapshotManifest(manifest, { updateSnapshots: true }),
			{
				ok: true,
				staleEntries: [
					{
						relativeSnapshotPath: "tests/math/add.test.snap",
						key: "adds~(1)",
						expectedValue: "2 + 2 = 4",
					},
				],
			},
		);
		assert.deepEqual(
			parseSnapshotFile(
				readFileSync(
					path.join(
						projectRoot,
						"__snapshots__",
						"tests",
						"math",
						"add.test.snap",
					),
					"utf8",
				),
			).map((entry) => entry.key),
			["adds~(0)"],
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

test("upsertSnapshotEntry creates missing snapshot files and persists new entries", () => {
	const projectRoot = mkdtempSync(path.join(tmpdir(), "as-harness-snapshots-"));

	try {
		const manifest = loadSnapshotManifest(projectRoot);
		assert.deepEqual(
			upsertSnapshotEntry(
				manifest,
				"tests/new/suite.test.ts",
				"new snapshot~(0)",
				"value",
			),
			{
				ok: true,
				outcome: "created",
				relativeSnapshotPath: "tests/new/suite.test.snap",
				key: "new snapshot~(0)",
				actualValue: "value",
			},
		);
		assert.equal(
			readFileSync(
				path.join(
					projectRoot,
					"__snapshots__",
					"tests",
					"new",
					"suite.test.snap",
				),
				"utf8",
			),
			"exports[`new snapshot~(0)`] = `value`;\n",
		);
	} finally {
		rmSync(projectRoot, { force: true, recursive: true });
	}
});

test("upsertSnapshotEntry updates existing snapshot entries in place", () => {
	const projectRoot = createSnapshotProject();

	try {
		const manifest = loadSnapshotManifest(projectRoot);
		assert.deepEqual(
			upsertSnapshotEntry(
				manifest,
				"tests/math/add.test.ts",
				"adds~(0)",
				"1 + 1 still = 2",
			).outcome,
			"updated",
		);
		assert.equal(
			parseSnapshotFile(
				readFileSync(
					path.join(
						projectRoot,
						"__snapshots__",
						"tests",
						"math",
						"add.test.snap",
					),
					"utf8",
				),
			)[0].value,
			"1 + 1 still = 2",
		);
	} finally {
		rmSync(projectRoot, { force: true, recursive: true });
	}
});
