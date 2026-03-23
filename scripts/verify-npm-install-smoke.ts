#!/usr/bin/env bun

import {
	appendFile,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { stageNpmPackages } from "./stage-npm-packages";

const REPO_DIR = join(import.meta.dir, "..");
const DEFAULT_OUTPUT_DIR = join(REPO_DIR, "dist", "npm");
const DEFAULT_REPORT_DIR = join(REPO_DIR, "dist", "npm-install-smoke-reports");
const CLI_ENTRYPOINT = join(
	"node_modules",
	"@as-harness",
	"cli",
	"bin",
	"as-harness.mjs",
);

type ParsedArguments = {
	outputDir: string;
	reportDir: string;
};

type CommandReport = {
	command: string[];
	cwd: string;
	exitCode: number;
	stderr: string;
	stdout: string;
	timedOut: boolean;
};

type TarballInfo = {
	directory: string;
	filename: string;
	name: string;
	path: string;
};

type ScenarioReport = {
	commands: CommandReport[];
	name: string;
};

function parseArguments(argv: string[]): ParsedArguments {
	let outputDir = DEFAULT_OUTPUT_DIR;
	let reportDir = DEFAULT_REPORT_DIR;

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];

		if (argument === "--output-dir") {
			outputDir = argv[index + 1] ?? outputDir;
			index += 1;
			continue;
		}

		if (argument === "--report-dir") {
			reportDir = argv[index + 1] ?? reportDir;
			index += 1;
			continue;
		}

		throw new Error(`Unknown argument: ${argument}`);
	}

	return { outputDir, reportDir };
}

function npmExecutable() {
	return process.platform === "win32" ? "npm.cmd" : "npm";
}

async function runCommand(
	command: string[],
	cwd: string,
	timeoutMs: number = 60_000,
): Promise<CommandReport> {
	const processHandle = Bun.spawn(command, {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	let timedOut = false;
	const timeoutHandle = setTimeout(() => {
		timedOut = true;
		processHandle.kill();
	}, timeoutMs);
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(processHandle.stdout).text(),
		new Response(processHandle.stderr).text(),
		processHandle.exited,
	]);
	clearTimeout(timeoutHandle);

	return {
		command,
		cwd,
		exitCode,
		stderr,
		stdout,
		timedOut,
	};
}

function assertSuccessfulCommand(report: CommandReport, context: string) {
	if (report.exitCode === 0) {
		return;
	}

	throw new Error(
		[
			report.timedOut
				? `${context} timed out.`
				: `${context} failed with exit code ${report.exitCode}.`,
			`command: ${report.command.join(" ")}`,
			report.stdout ? `stdout:\n${report.stdout}` : "",
			report.stderr ? `stderr:\n${report.stderr}` : "",
		]
			.filter(Boolean)
			.join("\n\n"),
	);
}

function assertFailedCommand(report: CommandReport, context: string) {
	if (report.exitCode !== 0) {
		return;
	}

	throw new Error(`${context} unexpectedly succeeded.`);
}

function assertContains(text: string, expected: string, context: string) {
	if (text.includes(expected)) {
		return;
	}

	throw new Error(
		`${context} did not include ${JSON.stringify(expected)}.\n${text}`,
	);
}

async function packStagedPackage(directory: string): Promise<TarballInfo> {
	const report = await runCommand(
		[npmExecutable(), "pack", "--json"],
		directory,
	);
	assertSuccessfulCommand(report, `npm pack in ${directory}`);

	const parsed = JSON.parse(report.stdout) as Array<{
		filename?: string;
		name?: string;
	}>;
	const entry = parsed[0];
	if (!entry?.filename || !entry.name) {
		throw new Error(
			`npm pack in ${directory} did not return package metadata.`,
		);
	}

	return {
		directory,
		filename: entry.filename,
		name: entry.name,
		path: resolve(directory, entry.filename),
	};
}

async function createTempProject(prefix: string) {
	const directory = await mkdtemp(join(tmpdir(), prefix));
	await writeFile(
		join(directory, "package.json"),
		`${JSON.stringify(
			{
				name: "as-harness-npm-smoke",
				private: true,
				type: "module",
			},
			null,
			2,
		)}\n`,
		"utf8",
	);
	return directory;
}

async function writeCliSmokeFixture(directory: string) {
	const entryFile = join(directory, "suite.test.ts");
	await writeFile(
		entryFile,
		[
			'import { test, TestContext } from "node:test";',
			"",
			'test("passing test", (_context: TestContext): void => {});',
			"",
		].join("\n"),
		"utf8",
	);
	return entryFile;
}

function installTarballPaths(
	tarballs: Map<string, TarballInfo>,
	packageNames: string[],
) {
	return packageNames.map((packageName) => {
		const tarball = tarballs.get(packageName);
		if (!tarball) {
			throw new Error(`Missing packed tarball for ${packageName}.`);
		}

		return tarball.path;
	});
}

function resolveRuntimeBinaryPackageName(
	tarballs: Map<string, TarballInfo>,
	runtimeName: "wazero" | "wasmtime",
) {
	for (const packageName of tarballs.keys()) {
		if (
			packageName.startsWith(`@as-harness/${runtimeName}-`) &&
			packageName !== `@as-harness/${runtimeName}`
		) {
			return packageName;
		}
	}

	return null;
}

async function runCliSmokeScenario(
	name: string,
	projectDirectory: string,
	tarballs: Map<string, TarballInfo>,
	harness: "js" | "wazero" | "wasmtime",
	runner: "node" | "bun",
) {
	const commands: CommandReport[] = [];
	const entryFile = await writeCliSmokeFixture(projectDirectory);
	const runtimeBinaryPackageName =
		harness === "js"
			? null
			: resolveRuntimeBinaryPackageName(tarballs, harness);
	const installPackages = installTarballPaths(tarballs, [
		"@as-harness/shared",
		"@as-harness/js",
		"@as-harness/cli",
		...(harness === "js"
			? []
			: [`@as-harness/${harness}`, runtimeBinaryPackageName ?? ""].filter(
					Boolean,
				)),
	]);
	const installReport = await runCommand(
		[npmExecutable(), "install", ...installPackages],
		projectDirectory,
	);
	commands.push(installReport);
	assertSuccessfulCommand(installReport, `${name} install`);

	const versionReport = await runCommand(
		[runner, CLI_ENTRYPOINT, "--version"],
		projectDirectory,
	);
	commands.push(versionReport);
	assertSuccessfulCommand(versionReport, `${name} ${runner} --version`);

	const runReport = await runCommand(
		[runner, CLI_ENTRYPOINT, "run", "--harness", harness, entryFile],
		projectDirectory,
	);
	commands.push(runReport);
	assertSuccessfulCommand(runReport, `${name} ${runner} run`);
	assertContains(
		[runReport.stdout, runReport.stderr].filter(Boolean).join("\n"),
		`PASS 1 passed, 0 failed, 1 discovered with ${harness}.`,
		`${name} ${runner} run output`,
	);

	return { commands, name };
}

async function runMissingNativeScenario(
	name: string,
	projectDirectory: string,
	tarballs: Map<string, TarballInfo>,
	runtimeName: "wazero" | "wasmtime",
) {
	const commands: CommandReport[] = [];
	const installReport = await runCommand(
		[
			npmExecutable(),
			"install",
			...installTarballPaths(tarballs, [
				"@as-harness/shared",
				`@as-harness/${runtimeName}`,
			]),
		],
		projectDirectory,
	);
	commands.push(installReport);
	assertSuccessfulCommand(installReport, `${name} install`);

	const requireReport = await runCommand(
		["node", "-e", `require("@as-harness/${runtimeName}")`],
		projectDirectory,
	);
	commands.push(requireReport);
	assertFailedCommand(requireReport, `${name} require`);
	assertContains(
		[requireReport.stdout, requireReport.stderr].filter(Boolean).join("\n"),
		`No native ${runtimeName} package is installed`,
		`${name} output`,
	);

	return { commands, name };
}

function renderMarkdownSummary(scenarios: ScenarioReport[]) {
	const lines = [
		"# Npm Install Smoke Verification",
		"",
		"## Scenarios",
		"",
		...scenarios.map(
			(scenario) =>
				`- \`${scenario.name}\`: ${scenario.commands.length} commands, all expectations met`,
		),
		"",
	];

	return `${lines.join("\n")}\n`;
}

async function main() {
	const { outputDir, reportDir } = parseArguments(process.argv.slice(2));
	const stagedPackages = await stageNpmPackages(outputDir);
	const tarballs = new Map<string, TarballInfo>();
	const temporaryDirectories: string[] = [];

	try {
		for (const stagedPackage of stagedPackages) {
			const tarball = await packStagedPackage(stagedPackage.directory);
			tarballs.set(tarball.name, tarball);
		}

		const scenarios: ScenarioReport[] = [];

		for (const harness of ["js", "wazero", "wasmtime"] as const) {
			for (const runner of ["node", "bun"] as const) {
				const projectDirectory = await createTempProject(
					`as-harness-npm-${harness}-${runner}-`,
				);
				temporaryDirectories.push(projectDirectory);
				scenarios.push(
					await runCliSmokeScenario(
						`cli-${harness}-${runner}`,
						projectDirectory,
						tarballs,
						harness,
						runner,
					),
				);
			}
		}

		const missingWazeroProject = await createTempProject(
			"as-harness-npm-missing-wazero-",
		);
		temporaryDirectories.push(missingWazeroProject);
		scenarios.push(
			await runMissingNativeScenario(
				"missing-wazero-binary",
				missingWazeroProject,
				tarballs,
				"wazero",
			),
		);

		const missingWasmtimeProject = await createTempProject(
			"as-harness-npm-missing-wasmtime-",
		);
		temporaryDirectories.push(missingWasmtimeProject);
		scenarios.push(
			await runMissingNativeScenario(
				"missing-wasmtime-binary",
				missingWasmtimeProject,
				tarballs,
				"wasmtime",
			),
		);

		const summary = renderMarkdownSummary(scenarios);
		await mkdir(reportDir, { recursive: true });
		await writeFile(
			join(reportDir, "npm-install-smoke.json"),
			`${JSON.stringify(
				{ generatedAt: new Date().toISOString(), scenarios },
				null,
				2,
			)}\n`,
			"utf8",
		);
		await writeFile(join(reportDir, "npm-install-smoke.md"), summary, "utf8");
		if (process.env.GITHUB_STEP_SUMMARY) {
			await appendFile(process.env.GITHUB_STEP_SUMMARY, summary, "utf8");
		}

		console.log(summary);
		console.log(`Wrote ${join(reportDir, "npm-install-smoke.json")}`);
		console.log(`Wrote ${join(reportDir, "npm-install-smoke.md")}`);
	} finally {
		await Promise.all(
			temporaryDirectories.map((directory) =>
				rm(directory, { force: true, recursive: true }),
			),
		);
	}
}

if (import.meta.main) {
	await main();
}
