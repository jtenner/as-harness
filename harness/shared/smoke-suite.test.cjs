"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { resolveAscCommand } = require("./smoke-suite.cjs");

test("shared smoke fixture compilation resolves the local asc entrypoint through Node", () => {
	const repoDir = path.join(__dirname, "..", "..");
	const assemblyDir = path.join(repoDir, "assembly");
	const resolved = resolveAscCommand(assemblyDir);

	assert.equal(resolved.command, process.execPath);
	assert.equal(
		resolved.ascEntrypoint,
		path.join(assemblyDir, "node_modules", "assemblyscript", "bin", "asc.js"),
	);
});
