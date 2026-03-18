#!/usr/bin/env bun

import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	hostValidationTargetForLabel,
	type SourceHarness,
} from "../cli/build-targets";

const REPO_DIR = join(import.meta.dir, "..");

type ParsedArguments = {
	reportDir: string;
	target: string;
};

type HarnessReport = {
	command: string[];
	durationMs: number;
	exitCode: number;
	harness: SourceHarness;
	stderr: string;
	stdout: string;
};

type CommandResult = {
	exitCode: number;
	stderr: string;
	stdout: string;
};

const HARNESS_COMMANDS: Record<
	SourceHarness,
	{ command: string[]; cwd: string }
> = {
	js: {
		command: ["npm", "test"],
		cwd: join(REPO_DIR, "harness", "js"),
	},
	wazero: {
		command: ["npm", "test"],
		cwd: join(REPO_DIR, "harness", "wazero"),
	},
	wasmtime: {
		command: ["npm", "test"],
		cwd: join(REPO_DIR, "harness", "wasmtime"),
	},
};

function parseArguments(argv: string[]): ParsedArguments {
	let reportDir: string | undefined;
	let target: string | undefined;

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];

		if (argument === "--target") {
			target = argv[index + 1];
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
		throw new Error("Missing required --target <label> argument.");
	}

	if (!reportDir) {
		throw new Error("Missing required --report-dir <directory> argument.");
	}

	return { reportDir, target };
}

async function runCommand(command: string[], cwd: string): Promise<CommandResult> {
	const processHandle = Bun.spawn(command, {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});

	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(processHandle.stdout).text(),
		new Response(processHandle.stderr).text(),
		processHandle.exited,
	]);

	return { exitCode, stderr, stdout };
}

async function assertActiveNodeVersion(expectedMajorVersion: string) {
	const versionCheck = await runCommand(["node", "-v"], REPO_DIR);
	if (versionCheck.exitCode !== 0) {
		throw new Error(
			[
				"Failed to resolve the active Node.js version for source-host verification.",
				versionCheck.stdout,
				versionCheck.stderr,
			].join("\n"),
		);
	}

	const activeVersion = versionCheck.stdout.trim().replace(/^v/, "");
	const activeMajorVersion = activeVersion.split(".")[0] ?? activeVersion;
	if (activeMajorVersion !== expectedMajorVersion) {
		throw new Error(
			[
				`Source-host verification target expects Node.js ${expectedMajorVersion}.`,
				`Active node on PATH is ${versionCheck.stdout.trim()}.`,
				"Switch Node.js versions before running this proof target.",
			].join(" "),
		);
	}
}

function renderMarkdownSummary(
	target: NonNullable<ReturnType<typeof hostValidationTargetForLabel>>,
	reports: HarnessReport[],
) {
	const lines = [
		`# Source Host Verification: ${target.label}`,
		"",
		`- Runner: \`${target.runner}\``,
		`- Node.js: \`${target.nodeVersion}\``,
		`- Architecture: \`${target.architecture}\``,
		`- Expected harnesses: ${target.sourceHarnesses.map((harness) => `\`${harness}\``).join(", ")}`,
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
	const { reportDir, target: targetLabel } = parseArguments(process.argv.slice(2));
	const target = hostValidationTargetForLabel(targetLabel);
	if (target === null) {
		throw new Error(`Unknown source-host validation target: ${targetLabel}`);
	}

	await assertActiveNodeVersion(target.nodeVersion);

	const reports: HarnessReport[] = [];
	let hasFailure = false;

	for (const harness of target.sourceHarnesses) {
		const { command, cwd } = HARNESS_COMMANDS[harness];
		const startedAt = performance.now();
		console.log(`Running ${harness} host verification for ${target.label}...`);
		const result = await runCommand(command, cwd);
		const durationMs = Math.round(performance.now() - startedAt);
		reports.push({
			command,
			durationMs,
			exitCode: result.exitCode,
			harness,
			stderr: result.stderr,
			stdout: result.stdout,
		});

		if (result.exitCode !== 0) {
			hasFailure = true;
		}
	}

	const report = {
		architecture: target.architecture,
		generatedAt: new Date().toISOString(),
		label: target.label,
		nodeVersion: target.nodeVersion,
		reports,
		runner: target.runner,
	};

	await mkdir(reportDir, { recursive: true });
	const jsonPath = join(reportDir, `source-host-${target.label}.json`);
	const markdownPath = join(reportDir, `source-host-${target.label}.md`);
	const markdownSummary = renderMarkdownSummary(target, reports);
	await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	await writeFile(markdownPath, markdownSummary, "utf8");
	if (process.env.GITHUB_STEP_SUMMARY) {
		await appendFile(process.env.GITHUB_STEP_SUMMARY, markdownSummary, "utf8");
	}

	console.log(markdownSummary);
	console.log(`Wrote ${jsonPath}`);
	console.log(`Wrote ${markdownPath}`);

	if (hasFailure) {
		const failingReports = reports.filter((report) => report.exitCode !== 0);
		throw new Error(
			failingReports
				.map(
					(report) =>
						`${report.harness} verification failed with exit code ${report.exitCode}.\n${report.stdout}\n${report.stderr}`,
				)
				.join("\n\n"),
		);
	}
}

await main();
