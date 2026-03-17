#!/usr/bin/env bun

import { copyFile, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	executableFilenameForTarget,
	releaseAssetFilenameForTarget,
} from "../cli/build-targets";
import {
	isAvailableWazeroAddonTarget,
	resolveWazeroAddonTargetForCompileTarget,
} from "../cli/runtime/wazero-targets";

const REPO_DIR = join(import.meta.dir, "..");

type ParsedArguments = {
	assetDir?: string;
	target: string;
};

type CommandResult = {
	exitCode: number;
	stderr: string;
	stdout: string;
};

function parseArguments(argv: string[]): ParsedArguments {
	let assetDir: string | undefined;
	let target: string | undefined;

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];

		if (argument === "--target") {
			target = argv[index + 1];
			index += 1;
			continue;
		}

		if (argument === "--asset-dir") {
			assetDir = argv[index + 1];
			index += 1;
			continue;
		}

		throw new Error(`Unknown argument: ${argument}`);
	}

	if (!target) {
		throw new Error("Missing required --target <compile-target> argument.");
	}

	return { assetDir, target };
}

async function runCommand(
	command: string[],
	cwd: string,
): Promise<CommandResult> {
	const processHandle = Bun.spawn(command, {
		cwd,
		stderr: "pipe",
		stdout: "pipe",
	});

	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(processHandle.stdout).text(),
		new Response(processHandle.stderr).text(),
		processHandle.exited,
	]);

	return { exitCode, stderr, stdout };
}

function assertContains(text: string, expected: string, context: string) {
	if (!text.includes(expected)) {
		throw new Error(
			`${context} did not include ${JSON.stringify(expected)}.\nActual output:\n${text}`,
		);
	}
}

async function main() {
	const { assetDir, target } = parseArguments(process.argv.slice(2));
	const executablePath = join(
		REPO_DIR,
		"cli",
		"dist",
		target,
		executableFilenameForTarget(target),
	);

	console.log(`Building packaged CLI target ${target}...`);

	const buildResult = await runCommand(
		[process.execPath, "run", "./cli/build.ts", target],
		REPO_DIR,
	);

	if (buildResult.exitCode !== 0) {
		throw new Error(
			[
				`Failed to build ${target}.`,
				buildResult.stdout,
				buildResult.stderr,
			].join("\n"),
		);
	}

	const tempDirectory = await mkdtemp(join(tmpdir(), "as-harness-packaged-cli-"));

	try {
		const entryFile = join(tempDirectory, "suite.test.ts");
		await writeFile(
			entryFile,
			[
				'import { test, TestContext } from "node:test";',
				"",
				'test("packaged smoke", (context: TestContext): void => {',
				'\tcontext.assert.strictEqual<i32>(1, 1, "same shape");',
				"});",
				"",
			].join("\n"),
			"utf8",
		);

		console.log(`Running packaged ${target} smoke test through js...`);

		const jsRunResult = await runCommand(
			[executablePath, "run", entryFile],
			REPO_DIR,
		);

		if (jsRunResult.exitCode !== 0) {
			throw new Error(
				[
					`Packaged js smoke failed for ${target}.`,
					jsRunResult.stdout,
					jsRunResult.stderr,
				].join("\n"),
			);
		}

		assertContains(
			jsRunResult.stdout,
			"PASS 1 test(s) across 1 top-level node(s) with js.",
			`Packaged js smoke for ${target}`,
		);

		const wazeroTarget = resolveWazeroAddonTargetForCompileTarget(target);
		if (isAvailableWazeroAddonTarget(wazeroTarget)) {
			console.log(`Running packaged ${target} smoke test through wazero...`);

			const wazeroRunResult = await runCommand(
				[executablePath, "run", "--harness", "wazero", entryFile],
				REPO_DIR,
			);

			if (wazeroRunResult.exitCode !== 0) {
				throw new Error(
					[
						`Packaged wazero smoke failed for ${target}.`,
						wazeroRunResult.stdout,
						wazeroRunResult.stderr,
					].join("\n"),
				);
			}

			assertContains(
				wazeroRunResult.stdout,
				"PASS 1 test(s) across 1 top-level node(s) with wazero.",
				`Packaged wazero smoke for ${target}`,
			);
		}

		if (assetDir) {
			await mkdir(assetDir, { recursive: true });
			const assetPath = join(assetDir, releaseAssetFilenameForTarget(target));
			await copyFile(executablePath, assetPath);
			console.log(`Copied release asset to ${assetPath}`);
		}
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
}

await main();
