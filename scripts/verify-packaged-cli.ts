#!/usr/bin/env bun

import { spawn } from "node:child_process";
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
import {
	COMMAND_TIMEOUT_ENV_VAR,
	createPackagedCommandRunnerSource,
	DEFAULT_COMMAND_TIMEOUT_MS,
} from "./packaged-command-runner";

const REPO_DIR = join(import.meta.dir, "..");
const NODE_RUNNER_SOURCE = createPackagedCommandRunnerSource();
const BUILD_COMMAND_TIMEOUT_MS = 180_000;
const SMOKE_COMMAND_TIMEOUT_MS = DEFAULT_COMMAND_TIMEOUT_MS;

type ParsedArguments = {
	assetDir?: string;
	reportDir?: string;
	target: string;
};

export type CommandResult = {
	command: string[];
	cwd: string;
	exitCode: number;
	stderr: string;
	stdout: string;
	timedOut: boolean;
};

const PACKAGED_SMOKE_ENV_KEYS = [
	"HOME",
	"LANG",
	"LC_ALL",
	"PATH",
	"PATHEXT",
	"SHELL",
	"SYSTEMROOT",
	"SystemRoot",
	"TEMP",
	"TMP",
	"TMPDIR",
	"USER",
	"USERPROFILE",
	"WINDIR",
] as const;

export type HarnessRunReport = {
	command: string[];
	cwd: string;
	durationMs: number;
	exitCode: number;
	harness: string;
	stderr: string;
	stdout: string;
	timedOut: boolean;
};

export function parseArguments(argv: string[]): ParsedArguments {
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

function resolveNodeExecutable() {
	const environmentCandidates = [
		process.env.AS_HARNESS_NODE_BINARY,
		process.env.npm_node_execpath,
		process.env.NODE,
	].filter((candidate): candidate is string => Boolean(candidate));

	for (const candidate of environmentCandidates) {
		return candidate;
	}

	const nodeFromPath = Bun.which("node");
	if (nodeFromPath) {
		return nodeFromPath;
	}

	throw new Error(
		[
			"Unable to find a Node executable for packaged CLI verification.",
			"Set AS_HARNESS_NODE_BINARY or ensure 'node' is on PATH.",
		].join(" "),
	);
}

async function runCommand(
	command: string[],
	cwd: string,
	extraEnv: Record<string, string> = {},
	timeoutMs: number = SMOKE_COMMAND_TIMEOUT_MS,
	baseEnv: Record<string, string> = process.env as Record<string, string>,
): Promise<CommandResult> {
	return await new Promise((resolve, reject) => {
		let stdout = "";
		let stderr = "";
		const child = spawn(
			resolveNodeExecutable(),
			["-e", NODE_RUNNER_SOURCE, cwd, ...command],
			{
				cwd,
				env: {
					...baseEnv,
					...extraEnv,
					[COMMAND_TIMEOUT_ENV_VAR]: String(timeoutMs),
				},
				stdio: ["ignore", "pipe", "pipe"],
			},
		);

		child.stdout.on("data", (chunk: Buffer | string) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk: Buffer | string) => {
			stderr += chunk.toString();
		});

		child.on("error", (error) => {
			reject(error);
		});
		child.on("close", (exitCode) => {
			try {
				if (exitCode !== 0) {
					throw new Error(
						stderr || `Node runner exited with code ${exitCode ?? 1}.`,
					);
				}

				const result = JSON.parse(stdout) as Omit<
					CommandResult,
					"command" | "cwd"
				> & {
					errorMessage?: string;
				};
				if (result.errorMessage) {
					throw new Error(result.errorMessage);
				}

				resolve({
					command,
					cwd,
					exitCode: result.exitCode,
					stderr: result.stderr,
					stdout: result.stdout,
					timedOut: result.timedOut,
				});
			} catch (error) {
				reject(error);
			}
		});
	});
}

export function createPackagedSmokeEnvironment(
	environment: NodeJS.ProcessEnv = process.env,
	extraEnv: Record<string, string> = {},
) {
	const cleanEnvironment: Record<string, string> = {};
	for (const key of PACKAGED_SMOKE_ENV_KEYS) {
		const value = environment[key];
		if (typeof value === "string" && value.length > 0) {
			cleanEnvironment[key] = value;
		}
	}

	return {
		...cleanEnvironment,
		...extraEnv,
	};
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

function formatCommandOutputBlocks(result: {
	stdout: string;
	stderr: string;
}): string[] {
	return [
		result.stdout ? `stdout:\n${result.stdout}` : "",
		result.stderr ? `stderr:\n${result.stderr}` : "",
	].filter(Boolean);
}

export function formatBuildFailure(
	target: string,
	result: CommandResult,
	timeoutMs: number = BUILD_COMMAND_TIMEOUT_MS,
) {
	return [
		`Packaged CLI build failed for ${target}.`,
		result.timedOut
			? `The build command timed out after ${timeoutMs}ms.`
			: `The build command exited with code ${result.exitCode}.`,
		"This is a real build-step failure, not verifier supervision.",
		...formatCommandOutputBlocks(result),
	].join("\n");
}

export function formatPackagedSmokeFailure(options: {
	diagnosticOutput?: string;
	harness: string;
	result: CommandResult;
	target: string;
	timeoutMs?: number;
}) {
	const {
		diagnosticOutput = "",
		harness,
		result,
		target,
		timeoutMs = SMOKE_COMMAND_TIMEOUT_MS,
	} = options;
	return [
		`Packaged ${harness} smoke failed for ${target}.`,
		result.timedOut
			? `The packaged command timed out after ${timeoutMs}ms. This points at a bundled-host hang or stuck packaged command, not verifier supervision.`
			: `The packaged command exited with code ${result.exitCode}. This points at a real packaged command failure, not verifier supervision.`,
		...formatCommandOutputBlocks(result),
		diagnosticOutput,
	]
		.filter(Boolean)
		.join("\n");
}

export function formatVerifierSupervisionFailure(options: {
	error: unknown;
	harness?: string;
	phase: "build" | "diagnostic-rerun" | "smoke";
	target: string;
}) {
	const { error, harness, phase, target } = options;
	const phaseLabel =
		phase === "build"
			? `building packaged target ${target}`
			: phase === "diagnostic-rerun"
				? `running the diagnostic ${harness} rerun for ${target}`
				: `running packaged ${harness} smoke for ${target}`;
	const message =
		error instanceof Error ? error.message : String(error ?? "unknown error");
	return [
		`Verifier supervision failed while ${phaseLabel}.`,
		"The packaged command wrapper failed before it could return a normal command result, so this points at verifier supervision rather than a proven packaged-host failure.",
		`Verifier error: ${message}`,
	].join("\n");
}

function renderReportStatus(
	report: Pick<HarnessRunReport, "exitCode" | "timedOut">,
) {
	if (report.exitCode === 0) {
		return "pass";
	}

	return report.timedOut ? "timeout" : "fail";
}

export function renderMarkdownSummary(
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
				`- \`${report.harness}\`: ${renderReportStatus(report)} in ${report.durationMs}ms`,
		),
		"",
	];

	return `${lines.join("\n")}\n`;
}

export async function main() {
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
	const stagedExecutableFilename = executableFilenameForTarget(target);

	console.log(`Building packaged CLI target ${target}...`);

	let buildResult: CommandResult;
	try {
		buildResult = await runCommand(
			[process.execPath, "run", "./cli/build.ts", target],
			REPO_DIR,
			{},
			BUILD_COMMAND_TIMEOUT_MS,
		);
	} catch (error) {
		throw new Error(
			formatVerifierSupervisionFailure({
				error,
				phase: "build",
				target,
			}),
		);
	}

	if (buildResult.exitCode !== 0) {
		throw new Error(formatBuildFailure(target, buildResult));
	}

	const tempDirectory = await mkdtemp(
		join(tmpdir(), "as-harness-packaged-cli-"),
	);

	try {
		const installDirectory = join(tempDirectory, "install");
		const projectDirectory = join(tempDirectory, "project");
		const runtimeTempDirectory = join(tempDirectory, "runtime-tmp");
		await mkdir(installDirectory, { recursive: true });
		await mkdir(projectDirectory, { recursive: true });
		await mkdir(runtimeTempDirectory, { recursive: true });

		const stagedExecutablePath = join(
			installDirectory,
			stagedExecutableFilename,
		);
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
		const smokeEnvironment = createPackagedSmokeEnvironment(process.env, {
			TEMP: runtimeTempDirectory,
			TMP: runtimeTempDirectory,
			TMPDIR: runtimeTempDirectory,
		});

		for (const harness of packagedHarnesses) {
			console.log(
				`Running packaged ${target} clean-environment smoke test through ${harness}...`,
			);

			const command =
				harness === "js"
					? [stagedExecutablePath, "run", entryFile]
					: [stagedExecutablePath, "run", "--harness", harness, entryFile];
			const startedAt = performance.now();
			let runResult: CommandResult;
			try {
				runResult = await runCommand(
					command,
					projectDirectory,
					{},
					SMOKE_COMMAND_TIMEOUT_MS,
					smokeEnvironment,
				);
			} catch (error) {
				throw new Error(
					formatVerifierSupervisionFailure({
						error,
						harness,
						phase: "smoke",
						target,
					}),
				);
			}
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
				let diagnosticOutput = "";
				if (harness === "wazero" && runResult.timedOut) {
					let diagnosticResult: CommandResult;
					try {
						diagnosticResult = await runCommand(
							command,
							projectDirectory,
							{ AS_HARNESS_TRACE_WAZERO: "1" },
							SMOKE_COMMAND_TIMEOUT_MS,
							smokeEnvironment,
						);
					} catch (error) {
						throw new Error(
							[
								formatPackagedSmokeFailure({
									harness,
									result: runResult,
									target,
								}),
								"",
								formatVerifierSupervisionFailure({
									error,
									harness,
									phase: "diagnostic-rerun",
									target,
								}),
							].join("\n"),
						);
					}
					diagnosticOutput = [
						"Diagnostic wazero rerun with AS_HARNESS_TRACE_WAZERO=1:",
						diagnosticResult.stdout,
						diagnosticResult.stderr,
					]
						.filter(Boolean)
						.join("\n");
				}

				throw new Error(
					formatPackagedSmokeFailure({
						diagnosticOutput,
						harness,
						result: runResult,
						target,
					}),
				);
			}

			assertSmokePass(runResult, target, harness);
		}

		if (assetDir) {
			await mkdir(assetDir, { recursive: true });
			const assetPath = join(assetDir, releaseAssetFilename);
			const archiveProcess = Bun.spawn(
				["tar", "-czf", assetPath, "-C", installDirectory, "."],
				{
					cwd: REPO_DIR,
					stderr: "inherit",
					stdout: "inherit",
					stdin: "inherit",
				},
			);
			const archiveExitCode = await archiveProcess.exited;
			if (archiveExitCode !== 0) {
				throw new Error(
					`Failed to archive packaged release asset ${releaseAssetFilename}.`,
				);
			}
			console.log(`Wrote release asset archive to ${assetPath}`);
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
				await appendFile(
					process.env.GITHUB_STEP_SUMMARY,
					markdownSummary,
					"utf8",
				);
			}
			console.log(markdownSummary);
			console.log(`Wrote ${jsonPath}`);
			console.log(`Wrote ${markdownPath}`);
		}
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
}

if (import.meta.main) {
	await main();
}
