"use strict";

const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");

let cachedBundleDirectory = null;
let cachedBundlePath = null;
let cleanupRegistered = false;

function registerCleanup() {
	if (cleanupRegistered) {
		return;
	}

	cleanupRegistered = true;
	process.once("exit", () => {
		if (cachedBundleDirectory === null) {
			return;
		}

		try {
			rmSync(cachedBundleDirectory, { force: true, recursive: true });
		} catch {}
	});
}

function assertSuccessfulBuild(result) {
	if (result.status === 0) {
		return;
	}

	const diagnostic = [
		`status: ${result.status}`,
		`signal: ${result.signal ?? ""}`,
		`stdout:\n${result.stdout}`,
		`stderr:\n${result.stderr}`,
		result.error ? `error:\n${String(result.error)}` : "",
	]
		.filter(Boolean)
		.join("\n\n");

	throw new Error(
		`Failed to build the Node-targeted source CLI bundle.\n\n${diagnostic}`,
	);
}

function resolveSourceCliBundlePath(repoDir) {
	if (cachedBundlePath !== null) {
		return cachedBundlePath;
	}

	const bundleDirectory = mkdtempSync(
		path.join(tmpdir(), "as-harness-source-cli-bundle-"),
	);
	const bundlePath = path.join(bundleDirectory, "as-harness-cli.mjs");
	const buildResult = spawnSync(
		"bun",
		["build", "--target=node", `--outfile=${bundlePath}`, "./cli/index.ts"],
		{
			cwd: repoDir,
			encoding: "utf8",
		},
	);

	assertSuccessfulBuild(buildResult);
	cachedBundleDirectory = bundleDirectory;
	cachedBundlePath = bundlePath;
	registerCleanup();
	return cachedBundlePath;
}

module.exports = {
	resolveSourceCliBundlePath,
};
