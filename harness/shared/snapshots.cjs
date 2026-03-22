"use strict";

const { readFileSync, readdirSync } = require("node:fs");
const path = require("node:path");

const SNAPSHOT_ROOT_DIRECTORY = "__snapshots__";
const SNAPSHOT_FILE_EXTENSION = ".snap";

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

function resolveSnapshotRelativePath(sourceFilePath) {
	const normalizedSourcePath = normalizeRelativeArtifactPath(sourceFilePath);
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

module.exports = {
	SNAPSHOT_FILE_EXTENSION,
	SNAPSHOT_ROOT_DIRECTORY,
	loadSnapshotManifest,
	parseSnapshotFile,
	renderSnapshotFile,
	resolveSnapshotPath,
	resolveSnapshotRelativePath,
};
