#!/usr/bin/env bun

import { join } from "node:path";
import type { SourceHarness } from "../cli/build-targets";

const REPO_DIR = join(import.meta.dir, "..");

export type SourceHarnessSmokeCommand = {
	command: string[];
	cwd: string;
};

function npmExecutable() {
	return process.platform === "win32" ? "npm.cmd" : "npm";
}

export function sourceHarnessPackageDir(harness: SourceHarness) {
	return join(REPO_DIR, "harness", harness);
}

export function sourceHarnessSmokeCommands(
	harness: SourceHarness,
): SourceHarnessSmokeCommand[] {
	return [
		{
			command: [npmExecutable(), "test"],
			cwd: sourceHarnessPackageDir(harness),
		},
	];
}
