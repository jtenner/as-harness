#!/usr/bin/env bun

import { spawn } from "node:child_process";
import {
	appendFile,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { stageNpmPackages } from "./stage-npm-packages";

const REPO_DIR = join(import.meta.dir, "..");
const DEFAULT_OUTPUT_DIR = join(REPO_DIR, "dist", "npm");
const DEFAULT_REPORT_DIR = join(REPO_DIR, "dist", "npm-install-smoke-reports");
const COMMAND_TIMEOUT_ENV_VAR = "AS_HARNESS_TIMEOUT_MS";
const INHERIT_STDIO_ENV_VAR = "AS_HARNESS_INHERIT_STDIO";
const DEFAULT_COMMAND_TIMEOUT_MS = 60_000;
const NODE_EXECUTABLE_SENTINEL = "__AS_HARNESS_NODE_EXECUTABLE__";
const CLI_ENTRYPOINT = join(
	"node_modules",
	"@as-harness",
	"cli",
	"bin",
	"as-harness.mjs",
);
const CLI_NODE_MODULES_DIR = join(REPO_DIR, "cli", "node_modules");
const NODE_RUNNER_SOURCE = String.raw`
const { spawn, spawnSync } = require("node:child_process");
const {
	closeSync,
	mkdtempSync,
	openSync,
	readFileSync,
	rmSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const cwd = process.argv[1];
const command = process.argv.slice(2);
const timeoutMs = Number(
	process.env.${COMMAND_TIMEOUT_ENV_VAR} || "${DEFAULT_COMMAND_TIMEOUT_MS}",
);
const inheritStdio = process.env.${INHERIT_STDIO_ENV_VAR} === "1";

function readTextFile(path) {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return "";
	}
}

function killProcessTree(child) {
	if (!child || typeof child.pid !== "number" || child.pid <= 0) {
		return;
	}

	if (process.platform === "win32") {
		try {
			spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
				stdio: "ignore",
				windowsHide: true,
			});
			return;
		} catch {}
	}

	try {
		child.kill("SIGKILL");
	} catch {}
}

async function main() {
	if (command.length === 0) {
		throw new Error("command runner requires a command");
	}

	const resolvedCommand =
		command[0] === "${NODE_EXECUTABLE_SENTINEL}"
			? [process.execPath, ...command.slice(1)]
			: command;

	const tempDirectory = mkdtempSync(join(tmpdir(), "as-harness-command-"));
	const stdoutPath = join(tempDirectory, "stdout.txt");
	const stderrPath = join(tempDirectory, "stderr.txt");
	let stdoutFd = -1;
	let stderrFd = -1;
	let child = null;
	let timedOut = false;
	let exitCode = 1;
	let errorMessage = "";

	try {
		if (!inheritStdio) {
			stdoutFd = openSync(stdoutPath, "w");
			stderrFd = openSync(stderrPath, "w");
		}
		child = spawn(resolvedCommand[0], resolvedCommand.slice(1), {
			cwd,
			stdio: inheritStdio
				? ["ignore", 2, 2]
				: ["ignore", stdoutFd, stderrFd],
			windowsHide: true,
		});
		if (!inheritStdio) {
			closeSync(stdoutFd);
			closeSync(stderrFd);
			stdoutFd = -1;
			stderrFd = -1;
		}

		await new Promise((resolve) => {
			let settled = false;
			const finish = (nextExitCode, nextErrorMessage = "") => {
				if (settled) {
					return;
				}

				settled = true;
				if (typeof nextExitCode === "number") {
					exitCode = nextExitCode;
				}
				if (nextErrorMessage.length > 0) {
					errorMessage = nextErrorMessage;
				}
				clearTimeout(timer);
				resolve();
			};

			const timer = setTimeout(() => {
				timedOut = true;
				killProcessTree(child);
				finish(124);
			}, timeoutMs);
			if (typeof timer.unref === "function") {
				timer.unref();
			}

			child.on("error", (error) => {
				finish(
					1,
					String(error && (error.message || error) ? error.message || error : error),
				);
			});
			child.on("exit", (code) => {
				finish(typeof code === "number" ? code : exitCode);
			});
		});

		process.stdout.write(
			JSON.stringify({
				exitCode: timedOut ? 124 : exitCode,
				stdout: inheritStdio ? "" : readTextFile(stdoutPath),
				stderr: inheritStdio ? "" : readTextFile(stderrPath),
				timedOut,
				errorMessage: timedOut ? "" : errorMessage,
			}),
		);
	} finally {
		if (stdoutFd !== -1) {
			closeSync(stdoutFd);
		}
		if (stderrFd !== -1) {
			closeSync(stderrFd);
		}
		if (timedOut) {
			killProcessTree(child);
		}
		rmSync(tempDirectory, { force: true, recursive: true });
	}

	process.exitCode = errorMessage.length > 0 && !timedOut ? 1 : 0;
}

main().catch((error) => {
	process.stderr.write(String(error && (error.stack || error.message || error)));
	process.exitCode = 1;
});
`;

type ParsedArguments = {
	outputDir: string;
	reportDir: string;
	selection: "all" | "native";
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

type CommandRunnerResult = Omit<CommandReport, "command" | "cwd"> & {
	errorMessage?: string;
};

function parseArguments(argv: string[]): ParsedArguments {
	let outputDir = DEFAULT_OUTPUT_DIR;
	let reportDir = DEFAULT_REPORT_DIR;
	let selection: ParsedArguments["selection"] = "all";

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

		if (argument === "--selection") {
			const value = argv[index + 1];
			if (value === "all" || value === "native") {
				selection = value;
				index += 1;
				continue;
			}

			throw new Error(`Unknown --selection value: ${value}`);
		}

		throw new Error(`Unknown argument: ${argument}`);
	}

	return { outputDir, reportDir, selection };
}

function findExecutableOnPath(candidates: readonly string[]) {
	const pathValue = process.env.PATH;
	if (!pathValue) {
		return null;
	}

	for (const directory of pathValue.split(
		process.platform === "win32" ? ";" : ":",
	)) {
		if (!directory) {
			continue;
		}

		for (const candidate of candidates) {
			const executablePath = join(directory, candidate);
			if (existsSync(executablePath)) {
				return executablePath;
			}
		}
	}

	return null;
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

	const nodeFromPath = findExecutableOnPath(
		process.platform === "win32" ? ["node.exe", "node.cmd", "node"] : ["node"],
	);
	if (nodeFromPath) {
		return nodeFromPath;
	}

	throw new Error(
		[
			"Unable to find a Node executable for npm install smoke.",
			"Set AS_HARNESS_NODE_BINARY or ensure `node` is on PATH.",
		].join(" "),
	);
}

function resolveNpmCommand() {
	const directCommandCandidates = [process.env.AS_HARNESS_NPM_BINARY].filter(
		(candidate): candidate is string => Boolean(candidate),
	);

	for (const candidate of directCommandCandidates) {
		if (existsSync(candidate)) {
			return [candidate];
		}
	}

	const nodeExecutable = resolveNodeExecutable();
	const nodeInstallDir = resolve(dirname(nodeExecutable), "..");
	const npmCliCandidates = [
		resolve(nodeInstallDir, "lib", "node_modules", "npm", "bin", "npm-cli.js"),
		resolve(nodeInstallDir, "node_modules", "npm", "bin", "npm-cli.js"),
	];

	for (const candidate of npmCliCandidates) {
		if (existsSync(candidate)) {
			return [NODE_EXECUTABLE_SENTINEL, candidate];
		}
	}

	const bareCommandCandidates =
		process.platform === "win32" ? ["npm.cmd", "npm"] : ["npm"];
	const npmFromPath = findExecutableOnPath(bareCommandCandidates);
	if (npmFromPath) {
		return [npmFromPath];
	}

	throw new Error(
		[
			"Unable to find an npm executable for npm install smoke.",
			"Set AS_HARNESS_NPM_BINARY, ensure `npm` is on PATH, or provide a Node install with npm bundled.",
		].join(" "),
	);
}

async function runCommand(
	command: string[],
	cwd: string,
	timeoutMs: number = DEFAULT_COMMAND_TIMEOUT_MS,
	captureOutput: boolean = true,
): Promise<CommandReport> {
	return await new Promise((resolve, reject) => {
		let stdout = "";
		let stderr = "";
		const child = spawn(
			resolveNodeExecutable(),
			["-e", NODE_RUNNER_SOURCE, cwd, ...command],
			{
				cwd,
				env: {
					...process.env,
					[COMMAND_TIMEOUT_ENV_VAR]: String(timeoutMs),
					[INHERIT_STDIO_ENV_VAR]: captureOutput ? "0" : "1",
				},
				stdio: ["ignore", "pipe", "pipe"],
				windowsHide: true,
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
				const result = JSON.parse(stdout) as CommandRunnerResult;
				if (result.errorMessage) {
					throw new Error(result.errorMessage);
				}
				if (exitCode !== 0) {
					throw new Error(
						[
							`Node command runner exited with code ${exitCode ?? 1}.`,
							result.stdout ? `stdout:\n${result.stdout}` : "",
							result.stderr ? `stderr:\n${result.stderr}` : "",
						]
							.filter(Boolean)
							.join("\n\n"),
					);
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
		[...resolveNpmCommand(), "pack", "--json"],
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

function assemblyscriptPeerInstallPaths() {
	return ["binaryen", "long", "assemblyscript"].map((packageName) =>
		resolve(CLI_NODE_MODULES_DIR, packageName),
	);
}

async function removeAssemblyscriptPeerPackages(projectDirectory: string) {
	for (const packageName of ["binaryen", "long", "assemblyscript"]) {
		await rm(join(projectDirectory, "node_modules", packageName), {
			force: true,
			recursive: true,
		});
	}
}

function assertAssemblyscriptPeerFixturesAvailable() {
	const missingPaths = assemblyscriptPeerInstallPaths().filter(
		(packagePath) => !existsSync(packagePath),
	);
	if (missingPaths.length === 0) {
		return;
	}

	throw new Error(
		[
			"Missing local AssemblyScript peer fixtures for npm install smoke.",
			"Run `cd cli && bun install` before executing this script.",
			...missingPaths.map((packagePath) => `missing: ${packagePath}`),
		].join("\n"),
	);
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
	]).concat(assemblyscriptPeerInstallPaths());
	const installReport = await runCommand(
		[...resolveNpmCommand(), "install", ...installPackages],
		projectDirectory,
	);
	commands.push(installReport);
	assertSuccessfulCommand(installReport, `${name} install`);

	if (runner !== "bun") {
		const versionReport = await runCommand(
			[runner, CLI_ENTRYPOINT, "--version"],
			projectDirectory,
			DEFAULT_COMMAND_TIMEOUT_MS,
			true,
		);
		commands.push(versionReport);
		assertSuccessfulCommand(versionReport, `${name} ${runner} --version`);
	}

	const runReport = await runCommand(
		[runner, CLI_ENTRYPOINT, "run", "--harness", harness, entryFile],
		projectDirectory,
		DEFAULT_COMMAND_TIMEOUT_MS,
		runner !== "bun",
	);
	commands.push(runReport);
	assertSuccessfulCommand(runReport, `${name} ${runner} run`);
	if (runner !== "bun") {
		assertContains(
			[runReport.stdout, runReport.stderr].filter(Boolean).join("\n"),
			`PASS 1 passed, 0 failed, 1 discovered with ${harness}.`,
			`${name} ${runner} run output`,
		);
	}

	return { commands, name };
}

async function runMissingAssemblyScriptScenario(
	name: string,
	projectDirectory: string,
	tarballs: Map<string, TarballInfo>,
) {
	const commands: CommandReport[] = [];
	const entryFile = await writeCliSmokeFixture(projectDirectory);
	const installReport = await runCommand(
		[
			...resolveNpmCommand(),
			"install",
			...installTarballPaths(tarballs, [
				"@as-harness/shared",
				"@as-harness/js",
				"@as-harness/cli",
			]),
		],
		projectDirectory,
	);
	commands.push(installReport);
	assertSuccessfulCommand(installReport, `${name} install`);

	// npm may auto-install peer dependencies, so remove them explicitly before
	// proving the runtime behavior when the peer is genuinely absent.
	await removeAssemblyscriptPeerPackages(projectDirectory);

	const versionReport = await runCommand(
		["node", CLI_ENTRYPOINT, "--version"],
		projectDirectory,
	);
	commands.push(versionReport);
	assertSuccessfulCommand(versionReport, `${name} node --version`);

	const runReport = await runCommand(
		["node", CLI_ENTRYPOINT, "run", "--harness", "js", entryFile],
		projectDirectory,
	);
	commands.push(runReport);
	assertFailedCommand(runReport, `${name} node run`);
	assertContains(
		[runReport.stdout, runReport.stderr].filter(Boolean).join("\n"),
		"Install `assemblyscript` in the consuming project alongside `@as-harness/cli`.",
		`${name} output`,
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
			...resolveNpmCommand(),
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
	const { outputDir, reportDir, selection } = parseArguments(
		process.argv.slice(2),
	);
	assertAssemblyscriptPeerFixturesAvailable();
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
			const runners =
				harness === "js" && selection === "all"
					? (["node", "bun"] as const)
					: (["node"] as const);
			for (const runner of runners) {
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

		const missingAssemblyScriptProject = await createTempProject(
			"as-harness-npm-missing-assemblyscript-",
		);
		temporaryDirectories.push(missingAssemblyScriptProject);
		scenarios.push(
			await runMissingAssemblyScriptScenario(
				"missing-assemblyscript-peer",
				missingAssemblyScriptProject,
				tarballs,
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
