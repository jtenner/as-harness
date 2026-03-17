#!/usr/bin/env bun

import {
	appendFile,
	copyFile,
	mkdtemp,
	mkdir,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	executableFilenameForTarget,
	releaseBuildTargetForCompileTarget,
	packagedHarnessesForCompileTarget,
	releaseAssetFilenameForTarget,
} from "../cli/build-targets";

const REPO_DIR = join(import.meta.dir, "..");

type ParsedArguments = {
	assetDir?: string;
	reportDir?: string;
	target: string;
};

type CommandResult = {
	command: string[];
	cwd: string;
	exitCode: number;
	stderr: string;
	stdout: string;
	timedOut: boolean;
};

type HarnessRunReport = {
	command: string[];
	cwd: string;
	durationMs: number;
	exitCode: number;
	harness: string;
	stderr: string;
	stdout: string;
	timedOut: boolean;
};

const COMMAND_TIMEOUT_MS = 60_000;

function parseArguments(argv: string[]): ParsedArguments {
	let assetDir: string | undefined;
	let reportDir: string | undefined;
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

		if (argument === "--report-dir") {
			reportDir = argv[index + 1];
			index += 1;
			continue;
		}

		throw new Error(`Unknown argument: ${argument}`);
	}

	if (!target) {
		throw new Error("Missing required --target <compile-target> argument.");
	}

	return { assetDir, reportDir, target };
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
	let timedOut = false;
	const timeoutHandle = setTimeout(() => {
		timedOut = true;
		processHandle.kill();
	}, COMMAND_TIMEOUT_MS);

	try {
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(processHandle.stdout).text(),
			new Response(processHandle.stderr).text(),
			processHandle.exited,
		]);

		return { command, cwd, exitCode, stderr, stdout, timedOut };
	} finally {
		clearTimeout(timeoutHandle);
	}
}

function assertContains(text: string, expected: string, context: string) {
	if (!text.includes(expected)) {
		throw new Error(
			`${context} did not include ${JSON.stringify(expected)}.\nActual output:\n${text}`,
		);
	}
}

function assertSmokePass(
	result: CommandResult,
	target: string,
	harness: string,
) {
	const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
	assertContains(
		output,
		`PASS 1 passed, 0 failed, 1 discovered with ${harness}.`,
		`Packaged ${harness} smoke for ${target}`,
	);
}

function renderMarkdownSummary(
	target: string,
	packagedHarnesses: readonly string[],
	reports: HarnessRunReport[],
) {
	const lines = [
		`# Packaged CLI Verification: ${target}`,
		"",
		`- Packaged harnesses: ${packagedHarnesses.map((harness) => `\`${harness}\``).join(", ")}`,
		`- Verification mode: clean-environment staged executable`,
		"",
		"## Results",
		"",
		...reports.map(
			(report) =>
				`- \`${report.harness}\`: ${report.exitCode === 0 ? "pass" : "fail"} in ${report.durationMs}ms`,
		),
		"",
	];

	return `${lines.join("\n")}\n`;
}

async function main() {
	const { assetDir, reportDir, target } = parseArguments(process.argv.slice(2));
	const targetMetadata = releaseBuildTargetForCompileTarget(target);
	if (targetMetadata === null) {
		throw new Error(`Unknown packaged release target: ${target}`);
	}

	const builtExecutablePath = join(
		REPO_DIR,
		"cli",
		"dist",
		target,
		executableFilenameForTarget(target),
	);
	const packagedHarnesses = packagedHarnessesForCompileTarget(target);
	const releaseAssetFilename = releaseAssetFilenameForTarget(target);

	console.log(`Building packaged CLI target ${target}...`);

	const buildResult = await runCommand(
		[process.execPath, "run", "./cli/build.ts", target],
		REPO_DIR,
	);

	if (buildResult.exitCode !== 0) {
		throw new Error(
			[
				`Failed to build ${target}.`,
				buildResult.timedOut ? `Timed out after ${COMMAND_TIMEOUT_MS}ms.` : "",
				buildResult.stdout,
				buildResult.stderr,
			].join("\n"),
		);
	}

	const tempDirectory = await mkdtemp(join(tmpdir(), "as-harness-packaged-cli-"));

	try {
		const installDirectory = join(tempDirectory, "install");
		const projectDirectory = join(tempDirectory, "project");
		await mkdir(installDirectory, { recursive: true });
		await mkdir(projectDirectory, { recursive: true });

		const stagedExecutablePath = join(installDirectory, releaseAssetFilename);
		await copyFile(builtExecutablePath, stagedExecutablePath);

		const entryFile = join(projectDirectory, "suite.test.ts");
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

		const reports: HarnessRunReport[] = [];

		for (const harness of packagedHarnesses) {
			console.log(
				`Running packaged ${target} clean-environment smoke test through ${harness}...`,
			);

			const command =
				harness === "js"
					? [stagedExecutablePath, "run", entryFile]
					: [stagedExecutablePath, "run", "--harness", harness, entryFile];
			const startedAt = performance.now();
			const runResult = await runCommand(command, projectDirectory);
			const durationMs = Math.round(performance.now() - startedAt);
			reports.push({
				command: runResult.command,
				cwd: runResult.cwd,
				durationMs,
				exitCode: runResult.exitCode,
				harness,
				stderr: runResult.stderr,
				stdout: runResult.stdout,
				timedOut: runResult.timedOut,
			});

			if (runResult.exitCode !== 0) {
				throw new Error(
					[
						`Packaged ${harness} smoke failed for ${target}.`,
						runResult.timedOut
							? `Timed out after ${COMMAND_TIMEOUT_MS}ms.`
							: "",
						runResult.stdout,
						runResult.stderr,
					].join("\n"),
				);
			}

			assertSmokePass(runResult, target, harness);
		}

		if (assetDir) {
			await mkdir(assetDir, { recursive: true });
			const assetPath = join(assetDir, releaseAssetFilename);
			await copyFile(stagedExecutablePath, assetPath);
			console.log(`Copied release asset to ${assetPath}`);
		}

		if (reportDir) {
			const report = {
				generatedAt: new Date().toISOString(),
				packagedHarnesses,
				releaseAssetFilename,
				runner: targetMetadata.runner,
				stagedExecutablePath,
				target,
				reports,
			};
			const markdownSummary = renderMarkdownSummary(
				target,
				packagedHarnesses,
				reports,
			);
			await mkdir(reportDir, { recursive: true });
			const jsonPath = join(reportDir, `packaged-cli-${target}.json`);
			const markdownPath = join(reportDir, `packaged-cli-${target}.md`);
			await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
			await writeFile(markdownPath, markdownSummary, "utf8");
			if (process.env.GITHUB_STEP_SUMMARY) {
				await appendFile(process.env.GITHUB_STEP_SUMMARY, markdownSummary, "utf8");
			}
			console.log(markdownSummary);
			console.log(`Wrote ${jsonPath}`);
			console.log(`Wrote ${markdownPath}`);
		}
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
}

await main();
