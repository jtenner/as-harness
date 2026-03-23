#!/usr/bin/env bun

import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import cliPackageJson from "../cli/package.json";

const REPO_DIR = join(import.meta.dir, "..");
const DEFAULT_OUTPUT_DIR = join(REPO_DIR, "dist", "npm");
const PACKAGE_VERSION = cliPackageJson.version;
const REPOSITORY_URL = "git+https://github.com/jtenner/as-harness.git";
const HOMEPAGE_URL = "https://github.com/jtenner/as-harness";
const BUGS_URL = "https://github.com/jtenner/as-harness/issues";
const LEGAL_FILES = [
	"LICENSE",
	"THIRD_PARTY_NOTICES.md",
	join("licenses", "wasmtime", "THIRD_PARTY_INVENTORY.md"),
] as const;
export const SUPPORTED_NATIVE_TARGETS = [
	{
		cpu: "arm64",
		libc: undefined,
		os: "darwin",
		packageSuffix: "darwin-arm64",
	},
	{
		cpu: "x64",
		libc: undefined,
		os: "darwin",
		packageSuffix: "darwin-x64",
	},
	{
		cpu: "arm64",
		libc: "glibc",
		os: "linux",
		packageSuffix: "linux-arm64-gnu",
	},
	{
		cpu: "x64",
		libc: "glibc",
		os: "linux",
		packageSuffix: "linux-x64-gnu",
	},
	{
		cpu: "x64",
		libc: undefined,
		os: "win32",
		packageSuffix: "win32-x64-msvc",
	},
] as const;

type ParsedArguments = {
	outputDir: string;
};

type RuntimeName = "wazero" | "wasmtime";
type SharedPackageName =
	| "@as-harness/shared"
	| "@as-harness/js"
	| "@as-harness/cli"
	| "@as-harness/wazero"
	| "@as-harness/wasmtime"
	| `@as-harness/wazero-${(typeof SUPPORTED_NATIVE_TARGETS)[number]["packageSuffix"]}`
	| `@as-harness/wasmtime-${(typeof SUPPORTED_NATIVE_TARGETS)[number]["packageSuffix"]}`;

type SupportedNativeTarget = (typeof SUPPORTED_NATIVE_TARGETS)[number];

type StagedPackage = {
	directory: string;
	name: SharedPackageName;
};

function assemblyscriptVersionRange() {
	return (
		cliPackageJson.devDependencies?.assemblyscript ??
		cliPackageJson.dependencies?.assemblyscript ??
		"^0.28.10"
	);
}

function parseArguments(argv: string[]): ParsedArguments {
	let outputDir = DEFAULT_OUTPUT_DIR;

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];

		if (argument === "--output-dir") {
			outputDir = argv[index + 1] ?? outputDir;
			index += 1;
			continue;
		}

		throw new Error(`Unknown argument: ${argument}`);
	}

	return { outputDir };
}

function packageDirectory(outputDir: string, packageName: SharedPackageName) {
	return join(outputDir, ...packageName.split("/"));
}

function nativeBinaryPackageName(
	runtimeName: RuntimeName,
	target: SupportedNativeTarget,
): SharedPackageName {
	return `@as-harness/${runtimeName}-${target.packageSuffix}`;
}

function supportedNativeBinaryPackageNames(runtimeName: RuntimeName) {
	return SUPPORTED_NATIVE_TARGETS.map((target) =>
		nativeBinaryPackageName(runtimeName, target),
	);
}

function currentNativeTarget() {
	return (
		SUPPORTED_NATIVE_TARGETS.find(
			(target) => target.os === process.platform && target.cpu === process.arch,
		) ?? null
	);
}

function nativeBinaryArtifactPath(runtimeName: RuntimeName) {
	return join(REPO_DIR, "harness", runtimeName, "dist", `${runtimeName}.node`);
}

async function copyRepoFile(
	sourceRelativePath: string,
	destinationPath: string,
) {
	await mkdir(dirname(destinationPath), { recursive: true });
	await cp(join(REPO_DIR, sourceRelativePath), destinationPath);
}

async function stageCommonLegalFiles(destinationDir: string) {
	for (const filename of LEGAL_FILES) {
		await copyRepoFile(filename, join(destinationDir, filename));
	}
}

function rewriteSharedImports(sourceText: string) {
	return sourceText
		.replaceAll("../shared/covers.cjs", "@as-harness/shared/covers")
		.replaceAll("../shared/start.cjs", "@as-harness/shared/start")
		.replaceAll("../shared/snapshots.cjs", "@as-harness/shared/snapshots")
		.replaceAll("../shared/harness-types", "@as-harness/shared/harness-types");
}

function rewriteNativeAddonRequire(
	sourceText: string,
	runtimeName: RuntimeName,
) {
	const supportedBinaryPackages =
		supportedNativeBinaryPackageNames(runtimeName);
	const loaderLines = [
		"function loadNativeAddon() {",
		"\tconst loadErrors = [];",
		`\tfor (const packageName of ${JSON.stringify(supportedBinaryPackages)}) {`,
		"\t\ttry {",
		"\t\t\treturn require(packageName);",
		"\t\t} catch (error) {",
		'\t\t\tif (error && typeof error === "object" && "code" in error) {',
		"\t\t\t\tconst code = error.code;",
		'\t\t\t\tif (code === "MODULE_NOT_FOUND" || code === "ERR_MODULE_NOT_FOUND") {',
		"\t\t\t\t\tloadErrors.push(packageName);",
		"\t\t\t\t\tcontinue;",
		"\t\t\t\t}",
		"\t\t\t}",
		"\t\t\tthrow error;",
		"\t\t}",
		"\t}",
		"\tthrow new Error(",
		"\t\t[",
		`\t\t\t\`No native ${runtimeName} package is installed for \${process.platform}-\${process.arch}.\`,`,
		'\t\t\t"Install this package on a supported platform so npm can realize the matching optional dependency.",',
		'\t\t\t`Tried: ${loadErrors.join(", ")}`',
		'\t\t].join(" "),',
		"\t);",
		"}",
		"",
		"const native = loadNativeAddon();",
	];

	return sourceText.replace(
		new RegExp(`const native = require\\("\\./dist/${runtimeName}\\.node"\\);`),
		loaderLines.join("\n"),
	);
}

function createNativeBinaryReadme(
	packageName: SharedPackageName,
	runtimeName: RuntimeName,
	target: SupportedNativeTarget,
) {
	return [
		`# ${packageName}`,
		"",
		`Platform binary package for \`@as-harness/${runtimeName}\`.`,
		"",
		`Target: \`${target.packageSuffix}\``,
		"",
		"This package is installed as an optional dependency by the matching",
		`meta package and is not intended for direct use.`,
		"",
	].join("\n");
}

async function buildNodeTargetedCliBundle(outputDir: string) {
	await rm(outputDir, { force: true, recursive: true });
	await mkdir(outputDir, { recursive: true });

	const processHandle = Bun.spawn(
		[
			process.execPath,
			"build",
			"--target=node",
			"--packages=external",
			"--splitting",
			`--outdir=${outputDir}`,
			"./cli/index.ts",
		],
		{
			cwd: REPO_DIR,
			env: process.env,
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
				`Failed to build the npm CLI bundle with exit code ${exitCode}.`,
				stdout,
				stderr,
			]
				.filter(Boolean)
				.join("\n\n"),
		);
	}

	const bundlePath = join(outputDir, "index.js");
	const executablePath = join(outputDir, "as-harness.mjs");
	const bundleFilenames = (await readdir(outputDir)).filter((filename) =>
		filename.endsWith(".js"),
	);
	await Promise.all(
		bundleFilenames.map(async (filename) => {
			const sourcePath = join(outputDir, filename);
			const sourceText = await readFile(sourcePath, "utf8");
			const normalizedSourceText = sourceText.replace(
				'process.env.AS_HARNESS_NPM_PACKAGE === "1"',
				"true",
			);
			if (filename === "index.js") {
				await writeFile(
					executablePath,
					normalizedSourceText.replace(
						/^#!\/usr\/bin\/env bun/m,
						"#!/usr/bin/env node",
					),
					"utf8",
				);
				return;
			}

			await writeFile(sourcePath, normalizedSourceText, "utf8");
		}),
	);
	await rm(bundlePath, { force: true });
}

async function stageSharedPackage(outputDir: string): Promise<StagedPackage> {
	const destinationDir = packageDirectory(outputDir, "@as-harness/shared");
	await mkdir(destinationDir, { recursive: true });

	for (const filename of [
		"covers-types.d.ts",
		"covers.cjs",
		"harness-types.d.ts",
		"snapshots.cjs",
		"start-worker.cjs",
		"start.cjs",
	] as const) {
		await copyRepoFile(
			join("harness", "shared", filename),
			join(destinationDir, filename),
		);
	}

	await copyRepoFile(
		join("harness", "shared", "README.md"),
		join(destinationDir, "README.md"),
	);
	await stageCommonLegalFiles(destinationDir);
	await writeFile(
		join(destinationDir, "package.json"),
		`${JSON.stringify(
			{
				name: "@as-harness/shared",
				version: PACKAGE_VERSION,
				license: "MIT",
				repository: {
					type: "git",
					url: REPOSITORY_URL,
				},
				homepage: HOMEPAGE_URL,
				bugs: {
					url: BUGS_URL,
				},
				files: [
					"README.md",
					"LICENSE",
					"THIRD_PARTY_NOTICES.md",
					"licenses/wasmtime/THIRD_PARTY_INVENTORY.md",
					"covers-types.d.ts",
					"covers.cjs",
					"harness-types.d.ts",
					"snapshots.cjs",
					"start-worker.cjs",
					"start.cjs",
				],
				exports: {
					"./covers": "./covers.cjs",
					"./covers-types": "./covers-types.d.ts",
					"./harness-types": "./harness-types.d.ts",
					"./snapshots": "./snapshots.cjs",
					"./start": "./start.cjs",
					"./package.json": "./package.json",
				},
				publishConfig: {
					access: "public",
				},
			},
			null,
			2,
		)}\n`,
		"utf8",
	);

	return { directory: destinationDir, name: "@as-harness/shared" };
}

async function stageJsPackage(outputDir: string): Promise<StagedPackage> {
	const destinationDir = packageDirectory(outputDir, "@as-harness/js");
	await mkdir(destinationDir, { recursive: true });

	const [indexCjs, indexDts] = await Promise.all([
		readFile(join(REPO_DIR, "harness", "js", "index.cjs"), "utf8"),
		readFile(join(REPO_DIR, "harness", "js", "index.d.ts"), "utf8"),
	]);

	await Promise.all([
		writeFile(
			join(destinationDir, "index.cjs"),
			rewriteSharedImports(indexCjs),
		),
		writeFile(
			join(destinationDir, "index.d.ts"),
			rewriteSharedImports(indexDts),
		),
		copyRepoFile(
			join("harness", "js", "README.md"),
			join(destinationDir, "README.md"),
		),
	]);
	await stageCommonLegalFiles(destinationDir);
	await writeFile(
		join(destinationDir, "package.json"),
		`${JSON.stringify(
			{
				name: "@as-harness/js",
				version: PACKAGE_VERSION,
				license: "MIT",
				repository: {
					type: "git",
					url: REPOSITORY_URL,
				},
				homepage: HOMEPAGE_URL,
				bugs: {
					url: BUGS_URL,
				},
				main: "./index.cjs",
				types: "./index.d.ts",
				files: [
					"README.md",
					"LICENSE",
					"THIRD_PARTY_NOTICES.md",
					"licenses/wasmtime/THIRD_PARTY_INVENTORY.md",
					"index.cjs",
					"index.d.ts",
				],
				exports: {
					".": {
						require: "./index.cjs",
						types: "./index.d.ts",
					},
					"./package.json": "./package.json",
				},
				dependencies: {
					"@as-harness/shared": PACKAGE_VERSION,
				},
				publishConfig: {
					access: "public",
				},
			},
			null,
			2,
		)}\n`,
		"utf8",
	);

	return { directory: destinationDir, name: "@as-harness/js" };
}

async function stageCliPackage(outputDir: string): Promise<StagedPackage> {
	const destinationDir = packageDirectory(outputDir, "@as-harness/cli");
	const bundleDirectory = join(destinationDir, "bin");

	await mkdir(bundleDirectory, { recursive: true });
	await buildNodeTargetedCliBundle(bundleDirectory);
	await Promise.all([
		copyRepoFile(join("cli", "README.md"), join(destinationDir, "README.md")),
		stageCommonLegalFiles(destinationDir),
	]);
	await writeFile(
		join(destinationDir, "package.json"),
		`${JSON.stringify(
			{
				name: "@as-harness/cli",
				version: PACKAGE_VERSION,
				license: "MIT",
				repository: {
					type: "git",
					url: REPOSITORY_URL,
				},
				homepage: HOMEPAGE_URL,
				bugs: {
					url: BUGS_URL,
				},
				type: "module",
				bin: {
					"as-harness": "./bin/as-harness.mjs",
				},
				files: [
					"README.md",
					"LICENSE",
					"THIRD_PARTY_NOTICES.md",
					"licenses/wasmtime/THIRD_PARTY_INVENTORY.md",
					"bin/",
				],
				dependencies: {
					"@as-harness/js": PACKAGE_VERSION,
				},
				peerDependencies: {
					assemblyscript: assemblyscriptVersionRange(),
				},
				optionalDependencies: {
					"@as-harness/wazero": PACKAGE_VERSION,
					"@as-harness/wasmtime": PACKAGE_VERSION,
				},
				publishConfig: {
					access: "public",
				},
			},
			null,
			2,
		)}\n`,
		"utf8",
	);

	return { directory: destinationDir, name: "@as-harness/cli" };
}

async function stageNativeMetaPackage(
	outputDir: string,
	runtimeName: RuntimeName,
): Promise<StagedPackage> {
	const packageName = `@as-harness/${runtimeName}` as const;
	const destinationDir = packageDirectory(outputDir, packageName);
	await mkdir(destinationDir, { recursive: true });

	const [indexCjs, indexDts] = await Promise.all([
		readFile(join(REPO_DIR, "harness", runtimeName, "index.cjs"), "utf8"),
		readFile(join(REPO_DIR, "harness", runtimeName, "index.d.ts"), "utf8"),
	]);
	const stagedIndexCjs = rewriteNativeAddonRequire(
		rewriteSharedImports(indexCjs),
		runtimeName,
	);
	const stagedIndexDts = rewriteSharedImports(indexDts);

	await Promise.all([
		writeFile(join(destinationDir, "index.cjs"), stagedIndexCjs),
		writeFile(join(destinationDir, "index.d.ts"), stagedIndexDts),
		copyRepoFile(
			join("harness", runtimeName, "README.md"),
			join(destinationDir, "README.md"),
		),
	]);
	await stageCommonLegalFiles(destinationDir);
	await writeFile(
		join(destinationDir, "package.json"),
		`${JSON.stringify(
			{
				name: packageName,
				version: PACKAGE_VERSION,
				license: "MIT",
				repository: {
					type: "git",
					url: REPOSITORY_URL,
				},
				homepage: HOMEPAGE_URL,
				bugs: {
					url: BUGS_URL,
				},
				main: "./index.cjs",
				types: "./index.d.ts",
				files: [
					"README.md",
					"LICENSE",
					"THIRD_PARTY_NOTICES.md",
					"licenses/wasmtime/THIRD_PARTY_INVENTORY.md",
					"index.cjs",
					"index.d.ts",
				],
				exports: {
					".": {
						require: "./index.cjs",
						types: "./index.d.ts",
					},
					"./package.json": "./package.json",
				},
				dependencies: {
					"@as-harness/shared": PACKAGE_VERSION,
				},
				optionalDependencies: Object.fromEntries(
					supportedNativeBinaryPackageNames(runtimeName).map(
						(binaryPackage) => [binaryPackage, PACKAGE_VERSION],
					),
				),
				publishConfig: {
					access: "public",
				},
			},
			null,
			2,
		)}\n`,
		"utf8",
	);

	return { directory: destinationDir, name: packageName };
}

export async function stageNativeBinaryPackage(
	outputDir: string,
	runtimeName: RuntimeName,
	target: SupportedNativeTarget,
	sourceBinaryPath: string,
) {
	const packageName = nativeBinaryPackageName(runtimeName, target);
	const destinationDir = packageDirectory(outputDir, packageName);
	const binaryFilename = `${runtimeName}.node`;

	await mkdir(destinationDir, { recursive: true });
	await Promise.all([
		cp(sourceBinaryPath, join(destinationDir, binaryFilename)),
		writeFile(
			join(destinationDir, "README.md"),
			createNativeBinaryReadme(packageName, runtimeName, target),
			"utf8",
		),
	]);
	await stageCommonLegalFiles(destinationDir);
	await writeFile(
		join(destinationDir, "package.json"),
		`${JSON.stringify(
			{
				name: packageName,
				version: PACKAGE_VERSION,
				license: "MIT",
				repository: {
					type: "git",
					url: REPOSITORY_URL,
				},
				homepage: HOMEPAGE_URL,
				bugs: {
					url: BUGS_URL,
				},
				main: `./${binaryFilename}`,
				files: [
					"README.md",
					"LICENSE",
					"THIRD_PARTY_NOTICES.md",
					"licenses/wasmtime/THIRD_PARTY_INVENTORY.md",
					binaryFilename,
				],
				os: [target.os],
				cpu: [target.cpu],
				...(target.libc ? { libc: [target.libc] } : {}),
				publishConfig: {
					access: "public",
				},
			},
			null,
			2,
		)}\n`,
		"utf8",
	);

	return { directory: destinationDir, name: packageName };
}

async function stageCurrentPlatformNativeBinaryPackages(outputDir: string) {
	const target = currentNativeTarget();
	if (target === null) {
		return [];
	}

	const stagedPackages: StagedPackage[] = [];
	for (const runtimeName of ["wazero", "wasmtime"] as const) {
		const sourceBinaryPath = nativeBinaryArtifactPath(runtimeName);
		if (!existsSync(sourceBinaryPath)) {
			console.warn(
				`Skipping ${runtimeName} native binary staging for ${target.packageSuffix}; missing ${sourceBinaryPath}.`,
			);
			continue;
		}

		stagedPackages.push(
			await stageNativeBinaryPackage(
				outputDir,
				runtimeName,
				target,
				sourceBinaryPath,
			),
		);
	}

	return stagedPackages;
}

export async function stageNpmPackages(outputDir = DEFAULT_OUTPUT_DIR) {
	await rm(outputDir, { force: true, recursive: true });
	await mkdir(outputDir, { recursive: true });

	const stagedPackages = await Promise.all([
		stageSharedPackage(outputDir),
		stageJsPackage(outputDir),
		stageCliPackage(outputDir),
		stageNativeMetaPackage(outputDir, "wazero"),
		stageNativeMetaPackage(outputDir, "wasmtime"),
	]);
	const stagedBinaryPackages =
		await stageCurrentPlatformNativeBinaryPackages(outputDir);
	return [...stagedPackages, ...stagedBinaryPackages];
}

async function main() {
	const { outputDir } = parseArguments(process.argv.slice(2));
	const stagedPackages = await stageNpmPackages(outputDir);
	for (const stagedPackage of stagedPackages) {
		console.log(`Staged ${stagedPackage.name} at ${stagedPackage.directory}`);
	}
}

if (import.meta.main) {
	await main();
}
