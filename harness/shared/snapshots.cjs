"use strict";

const {
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} = require("node:fs");
const path = require("node:path");

const FIXTURE_ROOT_DIRECTORY = "__fixtures__";
const SNAPSHOT_ROOT_DIRECTORY = "__snapshots__";
const SNAPSHOT_FILE_EXTENSION = ".snap";
const SNAPSHOT_KEY_SUFFIX_PATTERN = /^(.*)~\((\d+)\)$/u;

function toPosixPath(value) {
	return value.replaceAll("\\", "/");
}

function normalizeRelativeArtifactPath(relativePath) {
	if (typeof relativePath !== "string" || relativePath.length === 0) {
		throw new TypeError("expected a non-empty relative artifact path");
	}

	const normalized = toPosixPath(
		path.posix.normalize(toPosixPath(relativePath)),
	);
	if (
		normalized.length === 0 ||
		normalized === "." ||
		path.posix.isAbsolute(normalized) ||
		/^[A-Za-z]:\//.test(normalized) ||
		normalized.startsWith("../") ||
		normalized.includes("/../")
	) {
		throw new Error("artifact paths must stay within the project root");
	}

	return normalized;
}

function normalizeRelativeSourceFilePath(sourceFilePath) {
	try {
		return normalizeRelativeArtifactPath(sourceFilePath);
	} catch (error) {
		const basename = path.posix.basename(toPosixPath(sourceFilePath));
		if (basename.length === 0 || basename === "." || basename === "..") {
			throw error;
		}

		return normalizeRelativeArtifactPath(basename);
	}
}

function resolveSnapshotRelativePath(sourceFilePath) {
	const normalizedSourcePath = normalizeRelativeSourceFilePath(sourceFilePath);
	const parsed = path.posix.parse(normalizedSourcePath);
	return parsed.dir && parsed.dir !== "."
		? path.posix.join(parsed.dir, `${parsed.name}${SNAPSHOT_FILE_EXTENSION}`)
		: `${parsed.name}${SNAPSHOT_FILE_EXTENSION}`;
}

function resolveSnapshotPath(projectRoot, sourceFilePath) {
	return path.join(
		projectRoot,
		SNAPSHOT_ROOT_DIRECTORY,
		resolveSnapshotRelativePath(sourceFilePath),
	);
}

function resolveFixtureRelativePath(sourceFilePath, fixturePath) {
	const normalizedSourcePath = normalizeRelativeSourceFilePath(sourceFilePath);
	const normalizedFixturePath = normalizeRelativeArtifactPath(fixturePath);
	const sourceDirectory = path.posix.dirname(normalizedSourcePath);

	return sourceDirectory && sourceDirectory !== "."
		? path.posix.join(sourceDirectory, normalizedFixturePath)
		: normalizedFixturePath;
}

function resolveFixturePath(projectRoot, sourceFilePath, fixturePath) {
	return path.join(
		projectRoot,
		FIXTURE_ROOT_DIRECTORY,
		resolveFixtureRelativePath(sourceFilePath, fixturePath),
	);
}

function readFixtureText(projectRoot, sourceFilePath, fixturePath) {
	return readFileSync(
		resolveFixturePath(projectRoot, sourceFilePath, fixturePath),
		"utf8",
	);
}

function createSnapshotKey(baseName, occurrence) {
	if (typeof baseName !== "string" || baseName.length === 0) {
		throw new TypeError("expected a non-empty snapshot base name");
	}
	if (!Number.isInteger(occurrence) || occurrence < 0) {
		throw new TypeError("expected a non-negative snapshot occurrence");
	}

	return `${baseName}~(${occurrence})`;
}

function getSnapshotKeyBaseName(key) {
	if (typeof key !== "string" || key.length === 0) {
		throw new TypeError("expected a non-empty snapshot key");
	}

	const match = SNAPSHOT_KEY_SUFFIX_PATTERN.exec(key);
	return match ? match[1] : key;
}

function escapeTemplateLiteral(value) {
	return value
		.replaceAll("\\", "\\\\")
		.replaceAll("`", "\\`")
		.replaceAll("${", "\\${");
}

function readTemplateLiteral(sourceText, startOffset) {
	if (sourceText[startOffset] !== "`") {
		throw new Error("expected a template literal");
	}

	let index = startOffset + 1;
	let value = "";

	while (index < sourceText.length) {
		const character = sourceText[index];
		if (character === "`") {
			return { value, offset: index + 1 };
		}

		if (character === "\\") {
			if (index + 1 >= sourceText.length) {
				throw new Error("unterminated template literal escape");
			}

			const escapedCharacter = sourceText[index + 1];
			switch (escapedCharacter) {
				case "\\":
					value += "\\";
					break;
				case "`":
					value += "`";
					break;
				case "$":
					if (sourceText[index + 2] !== "{") {
						throw new Error("unsupported template literal escape");
					}
					value += "${";
					index += 1;
					break;
				case "n":
					value += "\n";
					break;
				case "r":
					value += "\r";
					break;
				case "t":
					value += "\t";
					break;
				default:
					throw new Error("unsupported template literal escape");
			}

			index += 2;
			continue;
		}

		value += character;
		index += 1;
	}

	throw new Error("unterminated template literal");
}

function skipWhitespace(sourceText, offset) {
	let index = offset;
	while (index < sourceText.length && /\s/u.test(sourceText[index])) {
		index += 1;
	}
	return index;
}

function parseSnapshotFile(sourceText) {
	if (typeof sourceText !== "string") {
		throw new TypeError("expected snapshot source text");
	}

	const entries = [];
	const seenKeys = new Set();
	let offset = skipWhitespace(sourceText, 0);

	while (offset < sourceText.length) {
		if (!sourceText.startsWith("exports[", offset)) {
			throw new Error("snapshot files must use export-map assignments");
		}
		offset += "exports[".length;
		offset = skipWhitespace(sourceText, offset);

		const decodedKey = readTemplateLiteral(sourceText, offset);
		offset = skipWhitespace(sourceText, decodedKey.offset);
		if (sourceText[offset] !== "]") {
			throw new Error("expected closing ] after snapshot key");
		}

		offset = skipWhitespace(sourceText, offset + 1);
		if (sourceText[offset] !== "=") {
			throw new Error("expected = after snapshot key");
		}

		offset = skipWhitespace(sourceText, offset + 1);
		const decodedValue = readTemplateLiteral(sourceText, offset);
		offset = skipWhitespace(sourceText, decodedValue.offset);
		if (sourceText[offset] !== ";") {
			throw new Error("expected ; after snapshot entry");
		}

		if (seenKeys.has(decodedKey.value)) {
			throw new Error(`duplicate snapshot key: ${decodedKey.value}`);
		}

		seenKeys.add(decodedKey.value);
		entries.push({
			key: decodedKey.value,
			value: decodedValue.value,
			matched: false,
		});
		offset = skipWhitespace(sourceText, offset + 1);
	}

	return entries;
}

function renderSnapshotFile(entries) {
	if (!Array.isArray(entries)) {
		throw new TypeError("expected an array of snapshot entries");
	}

	if (entries.length === 0) {
		return "";
	}

	return (
		entries
			.map((entry) => {
				if (
					!entry ||
					typeof entry.key !== "string" ||
					typeof entry.value !== "string"
				) {
					throw new TypeError(
						"snapshot entries must provide string key and value fields",
					);
				}

				return `exports[\`${escapeTemplateLiteral(entry.key)}\`] = \`${escapeTemplateLiteral(entry.value)}\`;`;
			})
			.join("\n\n") + "\n"
	);
}

function createSnapshotFileState(projectRoot, snapshotPath) {
	const relativeSnapshotPath = normalizeRelativeArtifactPath(
		toPosixPath(
			path.relative(
				path.join(projectRoot, SNAPSHOT_ROOT_DIRECTORY),
				snapshotPath,
			),
		),
	);
	const entries = parseSnapshotFile(readFileSync(snapshotPath, "utf8"));

	return {
		projectRoot,
		snapshotPath,
		relativeSnapshotPath,
		entries,
		entriesByKey: new Map(entries.map((entry) => [entry.key, entry])),
		touched: false,
		touchedExecutionNames: new Set(),
	};
}

function collectSnapshotPaths(snapshotRoot) {
	const pendingDirectories = [snapshotRoot];
	const snapshotPaths = [];

	while (pendingDirectories.length > 0) {
		const currentDirectory = pendingDirectories.pop();
		for (const directoryEntry of readdirSync(currentDirectory, {
			withFileTypes: true,
		})) {
			const entryPath = path.join(currentDirectory, directoryEntry.name);
			if (directoryEntry.isDirectory()) {
				pendingDirectories.push(entryPath);
				continue;
			}

			if (
				directoryEntry.isFile() &&
				entryPath.endsWith(SNAPSHOT_FILE_EXTENSION)
			) {
				snapshotPaths.push(entryPath);
			}
		}
	}

	return snapshotPaths.sort();
}

function loadSnapshotManifest(projectRoot) {
	if (typeof projectRoot !== "string" || projectRoot.length === 0) {
		throw new TypeError("expected a project root path");
	}

	const snapshotRoot = path.join(projectRoot, SNAPSHOT_ROOT_DIRECTORY);
	const files = [];

	try {
		for (const snapshotPath of collectSnapshotPaths(snapshotRoot)) {
			files.push(createSnapshotFileState(projectRoot, snapshotPath));
		}
	} catch (error) {
		if (error && error.code === "ENOENT") {
			return {
				projectRoot,
				snapshotRoot,
				files,
				filesByRelativePath: new Map(),
			};
		}

		throw error;
	}

	return {
		projectRoot,
		snapshotRoot,
		files,
		filesByRelativePath: new Map(
			files.map((fileState) => [fileState.relativeSnapshotPath, fileState]),
		),
	};
}

function resolveSnapshotFileState(manifest, sourceFilePath) {
	if (!manifest || !(manifest.filesByRelativePath instanceof Map)) {
		throw new TypeError("expected a loaded snapshot manifest");
	}

	return (
		manifest.filesByRelativePath.get(
			resolveSnapshotRelativePath(sourceFilePath),
		) ?? null
	);
}

function createSnapshotFileStateForSource(projectRoot, sourceFilePath) {
	const relativeSnapshotPath = resolveSnapshotRelativePath(sourceFilePath);
	const snapshotPath = path.join(
		projectRoot,
		SNAPSHOT_ROOT_DIRECTORY,
		relativeSnapshotPath,
	);

	return {
		projectRoot,
		snapshotPath,
		relativeSnapshotPath,
		entries: [],
		entriesByKey: new Map(),
		touched: false,
		touchedExecutionNames: new Set(),
	};
}

function persistSnapshotFileState(fileState) {
	if (!fileState || typeof fileState.snapshotPath !== "string") {
		throw new TypeError("expected a snapshot file state");
	}

	mkdirSync(path.dirname(fileState.snapshotPath), { recursive: true });
	writeFileSync(
		fileState.snapshotPath,
		renderSnapshotFile(
			fileState.entries.map((entry) => ({
				key: entry.key,
				value: entry.value,
			})),
		),
		"utf8",
	);
}

function upsertSnapshotEntry(manifest, sourceFilePath, key, value) {
	if (typeof key !== "string" || key.length === 0) {
		throw new TypeError("expected a non-empty snapshot key");
	}
	if (typeof value !== "string") {
		throw new TypeError("expected a string snapshot value");
	}
	if (!manifest || !(manifest.filesByRelativePath instanceof Map)) {
		throw new TypeError("expected a loaded snapshot manifest");
	}

	let fileState = resolveSnapshotFileState(manifest, sourceFilePath);
	let outcome = "updated";

	if (fileState === null) {
		fileState = createSnapshotFileStateForSource(
			manifest.projectRoot,
			sourceFilePath,
		);
		manifest.files.push(fileState);
		manifest.files.sort((left, right) =>
			left.relativeSnapshotPath.localeCompare(right.relativeSnapshotPath),
		);
		manifest.filesByRelativePath.set(fileState.relativeSnapshotPath, fileState);
		outcome = "created";
	}

	fileState.touched = true;
	fileState.touchedExecutionNames.add(getSnapshotKeyBaseName(key));
	const existingEntry = fileState.entriesByKey.get(key) ?? null;
	if (existingEntry === null) {
		const entry = {
			key,
			value,
			matched: true,
		};
		fileState.entries.push(entry);
		fileState.entriesByKey.set(key, entry);
		if (outcome !== "created") {
			outcome = "added-entry";
		}
	} else {
		existingEntry.value = value;
		existingEntry.matched = true;
	}

	persistSnapshotFileState(fileState);

	return {
		ok: true,
		outcome,
		relativeSnapshotPath: fileState.relativeSnapshotPath,
		key,
		actualValue: value,
	};
}

function matchSnapshotEntry(manifest, sourceFilePath, key, actualValue) {
	if (typeof key !== "string" || key.length === 0) {
		throw new TypeError("expected a non-empty snapshot key");
	}
	if (typeof actualValue !== "string") {
		throw new TypeError("expected a string snapshot value");
	}

	const relativeSnapshotPath = resolveSnapshotRelativePath(sourceFilePath);
	const fileState = resolveSnapshotFileState(manifest, sourceFilePath);
	if (fileState === null) {
		return {
			ok: false,
			outcome: "missing-snapshot-file",
			relativeSnapshotPath,
			key,
			actualValue,
		};
	}

	fileState.touched = true;
	fileState.touchedExecutionNames.add(getSnapshotKeyBaseName(key));
	const entry = fileState.entriesByKey.get(key) ?? null;
	if (entry === null) {
		return {
			ok: false,
			outcome: "missing-snapshot-entry",
			relativeSnapshotPath,
			key,
			actualValue,
		};
	}

	entry.matched = true;
	if (entry.value === actualValue) {
		return {
			ok: true,
			outcome: "match",
			relativeSnapshotPath,
			key,
			expectedValue: entry.value,
		};
	}

	return {
		ok: false,
		outcome: "mismatch",
		relativeSnapshotPath,
		key,
		expectedValue: entry.value,
		actualValue,
	};
}

function finalizeSnapshotManifest(manifest, options = {}) {
	if (!manifest || !Array.isArray(manifest.files)) {
		throw new TypeError("expected a loaded snapshot manifest");
	}

	const updateSnapshots = options.updateSnapshots === true;
	const staleEntries = [];
	for (const fileState of manifest.files) {
		if (
			!fileState ||
			fileState.touched !== true ||
			!Array.isArray(fileState.entries) ||
			!(fileState.touchedExecutionNames instanceof Set)
		) {
			continue;
		}

		let removedAnyEntries = false;
		const nextEntries = [];
		for (const entry of fileState.entries) {
			if (!entry) {
				continue;
			}
			const executionName = getSnapshotKeyBaseName(entry.key);
			const isTouchedExecution =
				fileState.touchedExecutionNames.has(executionName);
			if (entry.matched === true || !isTouchedExecution) {
				nextEntries.push(entry);
				continue;
			}

			staleEntries.push({
				relativeSnapshotPath: fileState.relativeSnapshotPath,
				key: entry.key,
				expectedValue: entry.value,
			});
			if (updateSnapshots) {
				fileState.entriesByKey.delete(entry.key);
				removedAnyEntries = true;
				continue;
			}

			nextEntries.push(entry);
		}

		if (updateSnapshots && removedAnyEntries) {
			fileState.entries = nextEntries;
			persistSnapshotFileState(fileState);
		}
	}

	return {
		ok: updateSnapshots || staleEntries.length === 0,
		staleEntries,
	};
}

module.exports = {
	FIXTURE_ROOT_DIRECTORY,
	createSnapshotKey,
	finalizeSnapshotManifest,
	getSnapshotKeyBaseName,
	matchSnapshotEntry,
	SNAPSHOT_FILE_EXTENSION,
	SNAPSHOT_ROOT_DIRECTORY,
	loadSnapshotManifest,
	parseSnapshotFile,
	readFixtureText,
	renderSnapshotFile,
	resolveFixturePath,
	resolveFixtureRelativePath,
	resolveSnapshotFileState,
	resolveSnapshotPath,
	resolveSnapshotRelativePath,
	upsertSnapshotEntry,
};
