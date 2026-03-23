#!/usr/bin/env bun

import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stageNpmPackages } from "./stage-npm-packages";

const REPO_DIR = join(import.meta.dir, "..");
const DEFAULT_OUTPUT_DIR = join(REPO_DIR, "dist", "npm");
const DEFAULT_REPORT_DIR = join(REPO_DIR, "dist", "npm-reports");

type ParsedArguments = {
	outputDir: string;
	reportDir: string;
};

type NpmPackFile = {
	path: string;
	size: number;
};

type NpmPackJsonEntry = {
	filename: string;
	files?: NpmPackFile[];
	id?: string;
	name?: string;
	packageSize?: number;
	unpackedSize?: number;
	version?: string;
};

type PackageVerificationReport = {
	directory: string;
	filename: string;
	files: NpmPackFile[];
	id: string;
	name: string;
	packageSize: number;
	unpackedSize: number;
	version: string;
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

async function runNpmPackDryRun(
	directory: string,
): Promise<PackageVerificationReport> {
	const processHandle = Bun.spawn(
		[npmExecutable(), "pack", "--dry-run", "--json"],
		{
			cwd: directory,
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(processHandle.stdout).text(),
		new Response(processHandle.stderr).text(),
		processHandle.exited,
	]);

	if (exitCode !== 0) {
		throw new Error(
			[
				`npm pack --dry-run failed in ${directory} with exit code ${exitCode}.`,
				stdout,
				stderr,
			]
				.filter(Boolean)
				.join("\n\n"),
		);
	}

	const parsed = JSON.parse(stdout) as NpmPackJsonEntry[];
	const entry = parsed[0];
	if (!entry?.name || !entry.version || !entry.filename || !entry.id) {
		throw new Error(
			`npm pack --dry-run in ${directory} did not return the expected package metadata.`,
		);
	}

	const files = entry.files ?? [];
	const filePaths = new Set(files.map((file) => file.path));
	for (const requiredFile of ["LICENSE", "README.md", "package.json"]) {
		if (!filePaths.has(requiredFile)) {
			throw new Error(
				`Packed package ${entry.name} is missing required file ${requiredFile}.`,
			);
		}
	}

	return {
		directory,
		filename: entry.filename,
		files,
		id: entry.id,
		name: entry.name,
		packageSize: entry.packageSize ?? 0,
		unpackedSize: entry.unpackedSize ?? 0,
		version: entry.version,
	};
}

function renderMarkdownSummary(reports: PackageVerificationReport[]) {
	const lines = [
		"# Npm Package Verification",
		"",
		"## Results",
		"",
		...reports.map(
			(report) =>
				`- \`${report.name}\`: \`${report.filename}\`, ${report.files.length} files, unpacked ${report.unpackedSize} bytes`,
		),
		"",
	];

	return `${lines.join("\n")}\n`;
}

async function main() {
	const { outputDir, reportDir } = parseArguments(process.argv.slice(2));
	const stagedPackages = await stageNpmPackages(outputDir);
	const reports = await Promise.all(
		stagedPackages.map(({ directory }) => runNpmPackDryRun(directory)),
	);
	const summary = renderMarkdownSummary(reports);

	await mkdir(reportDir, { recursive: true });
	await writeFile(
		join(reportDir, "npm-packages.json"),
		`${JSON.stringify({ generatedAt: new Date().toISOString(), reports }, null, 2)}\n`,
		"utf8",
	);
	await writeFile(join(reportDir, "npm-packages.md"), summary, "utf8");

	if (process.env.GITHUB_STEP_SUMMARY) {
		await appendFile(process.env.GITHUB_STEP_SUMMARY, summary, "utf8");
	}

	console.log(summary);
	console.log(`Wrote ${join(reportDir, "npm-packages.json")}`);
	console.log(`Wrote ${join(reportDir, "npm-packages.md")}`);
}

if (import.meta.main) {
	await main();
}
