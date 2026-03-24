import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, win32 } from "node:path";
import type {
	HarnessCreateOptions,
	HarnessStartResult,
} from "../harness/shared/harness-types";
import { stringifyCoverage } from "../harness/shared/covers.cjs";
import type {
	compileEntrypoints as compileEntrypointsType,
	CompilerOptions,
	withBundledCoverageTransform as withBundledCoverageTransformType,
} from "./as/compile";
import type { CoverageTransformPointTypeName } from "./transform/src/covers";
import {
	createHarnessRunReport,
	defaultRunReporter,
	type RunReporter,
} from "./reporter";
import { jsRuntime } from "./runtime/js";
import {
	classifyHarnessSpecifier,
	HarnessResolutionError,
	resolveRuntime,
} from "./runtime/resolve";
import type { Runtime } from "./runtime/types";

export enum RunExitCode {
	Success = 0,
	TestFailure = 1,
	CompileFailure = 2,
	HostFailure = 3,
}

export type RunLogger = {
	info(message: string): void;
	error(message: string): void;
};

export type RunCommandResult = {
	discoveredTestCount: number;
	exitCode: RunExitCode;
};

export type CoverageOptions = {
	enabled: boolean;
	format?: string;
	include?: string[];
	exclude?: string[];
	pointTypes?: CoverageTransformPointTypeName[];
};

export type ArtifactRunOptions = {
	updateSnapshots: boolean;
};

const DEFAULT_RUN_LIBRARIES = [
	"node:test",
	"node:assert",
	"node:assert/strict",
] as const;
const TEMP_RUN_ENTRY_PREFIX = ".as-harness-run-";
const TEMP_RUN_ENTRY_BASENAME = "entry.ts";

type CompilerModule = {
	compileEntrypoints: typeof compileEntrypointsType;
	withBundledCoverageTransform: typeof withBundledCoverageTransformType;
};

function createRunCompilerOptions(cwd: string): CompilerOptions {
	return {
		baseDir: cwd,
		lib: [...DEFAULT_RUN_LIBRARIES],
	};
}

function mergeRunCompilerOptions(
	cwd: string,
	overrides: CompilerOptions,
): CompilerOptions {
	return {
		...createRunCompilerOptions(cwd),
		...overrides,
		baseDir: overrides.baseDir ?? cwd,
		lib: [...DEFAULT_RUN_LIBRARIES, ...(overrides.lib ?? [])],
	};
}

function toPosixPath(path: string) {
	return path.replaceAll("\\", "/");
}

function resolveWindowsDriveRoot(path: string): string | null {
	const match = /^[A-Za-z]:[\\/]/.exec(path);
	return match ? match[0].slice(0, 2).toUpperCase() : null;
}

export function resolveRunEntrypointBaseDirectory(
	entryFiles: readonly string[],
	cwd: string,
	platform: NodeJS.Platform = process.platform,
) {
	if (platform !== "win32" || entryFiles.length === 0) {
		return cwd;
	}

	const pathModule = platform === "win32" ? win32 : { dirname };
	const firstEntryDirectory = pathModule.dirname(entryFiles[0]);
	const firstDrive = resolveWindowsDriveRoot(firstEntryDirectory);
	if (!firstDrive) {
		return firstEntryDirectory;
	}

	for (const entryFile of entryFiles.slice(1)) {
		const entryDrive = resolveWindowsDriveRoot(pathModule.dirname(entryFile));
		if (entryDrive && entryDrive !== firstDrive) {
			throw new Error(
				[
					"as-harness run does not support entry files on multiple Windows drives.",
					`Saw both ${firstDrive} and ${entryDrive}.`,
				].join(" "),
			);
		}
	}

	return firstEntryDirectory;
}

function toImportPath(fromDirectory: string, targetPath: string) {
	const relativePath = toPosixPath(relative(fromDirectory, targetPath));
	return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

async function createRunEntrypoint(
	entryFiles: readonly string[],
	cwd: string,
): Promise<{ cleanup(): Promise<void>; path: string }> {
	const tempBaseDirectory = resolveRunEntrypointBaseDirectory(entryFiles, cwd);
	const tempDirectory = await mkdtemp(
		join(tempBaseDirectory, TEMP_RUN_ENTRY_PREFIX),
	);
	const entrypointPath = join(tempDirectory, TEMP_RUN_ENTRY_BASENAME);
	const entrypointDirectory = dirname(entrypointPath);
	const sourceText = [
		'export { allocateNodeIndexBuffer, discover, invoke, run } from "~/.as-harness/exports";',
		...entryFiles.map(
			(entryFile) =>
				`import "${toImportPath(entrypointDirectory, entryFile)}";`,
		),
		"",
	].join("\n");

	await writeFile(entrypointPath, sourceText, "utf8");

	return {
		async cleanup() {
			await rm(tempDirectory, { force: true, recursive: true });
		},
		path: entrypointPath,
	};
}

function getWasmArtifactBytes(
	wasmArtifacts: Awaited<ReturnType<CompilerModule["compileEntrypoints"]>>,
) {
	const wasmArtifact = wasmArtifacts.find((artifact) =>
		artifact.path.endsWith(".wasm"),
	);
	if (!wasmArtifact) {
		throw new Error("Compilation completed without emitting a wasm artifact.");
	}

	return wasmArtifact.contents;
}

function normalizeCompilerLoadError(error: unknown) {
	if (!(error instanceof Error)) {
		return error;
	}

	const code =
		typeof (error as NodeJS.ErrnoException).code === "string"
			? (error as NodeJS.ErrnoException).code
			: null;
	const message = error.message;
	if (
		(code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") &&
		message.includes("assemblyscript")
	) {
		return new Error(
			[
				"AssemblyScript is required to compile tests with @as-harness/cli.",
				"Install `assemblyscript` in the consuming project alongside `@as-harness/cli`.",
			].join(" "),
		);
	}

	return error;
}

async function loadCompilerModule(): Promise<CompilerModule> {
	try {
		return (await import("./as/compile")) as CompilerModule;
	} catch (error) {
		throw normalizeCompilerLoadError(error);
	}
}

export async function runEntryFiles(
	entryFiles: readonly string[],
	cwd: string,
	logger: RunLogger,
	runtimeSelection: Runtime | string | undefined = jsRuntime,
	compilerOptions: CompilerOptions = {},
	reporter: RunReporter = defaultRunReporter,
	coverageOptions: CoverageOptions = { enabled: false },
	artifactOptions: ArtifactRunOptions = { updateSnapshots: false },
): Promise<RunCommandResult> {
	let wasmBytes: Uint8Array;
	const temporaryEntrypoint = await createRunEntrypoint(entryFiles, cwd);
	let compileRuntime = jsRuntime;
	let runtime: Runtime | null = null;

	if (typeof runtimeSelection !== "string") {
		compileRuntime = runtimeSelection;
		runtime = runtimeSelection;
	} else if (classifyHarnessSpecifier(runtimeSelection).kind !== "builtin") {
		try {
			runtime = await resolveRuntime(runtimeSelection, cwd);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error(`Harness resolution failed: ${message}`);
			await temporaryEntrypoint.cleanup();
			return {
				discoveredTestCount: 0,
				exitCode: RunExitCode.HostFailure,
			};
		}

		compileRuntime = {
			...runtime,
			mutateCompilerArguments(compilerArguments) {
				jsRuntime.mutateCompilerArguments(compilerArguments);
				try {
					runtime.mutateCompilerArguments(compilerArguments);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					throw new HarnessResolutionError(
						`Custom harness mutateCompilerArguments(...) threw: ${runtime.name}. ${message}`,
					);
				}
			},
		};
	}

	try {
		const compilerModule = await loadCompilerModule();
		const artifacts = await compilerModule.compileEntrypoints(
			[temporaryEntrypoint.path],
			compilerModule.withBundledCoverageTransform(
				mergeRunCompilerOptions(cwd, compilerOptions),
				coverageOptions.enabled
					? {
							baseDir: compilerOptions.baseDir ?? cwd,
							include: coverageOptions.include,
							exclude: coverageOptions.exclude,
							pointTypes: coverageOptions.pointTypes,
						}
					: false,
			),
			compileRuntime,
		);
		wasmBytes = getWasmArtifactBytes(artifacts);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (error instanceof HarnessResolutionError) {
			logger.error(`Harness resolution failed: ${message}`);
			return {
				discoveredTestCount: 0,
				exitCode: RunExitCode.HostFailure,
			};
		}

		logger.error(`Compilation failed: ${message}`);
		return {
			discoveredTestCount: 0,
			exitCode: RunExitCode.CompileFailure,
		};
	} finally {
		await temporaryEntrypoint.cleanup();
	}

	if (runtime === null) {
		try {
			runtime =
				typeof runtimeSelection === "string"
					? await resolveRuntime(runtimeSelection, cwd)
					: runtimeSelection;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error(`Harness resolution failed: ${message}`);
			return {
				discoveredTestCount: 0,
				exitCode: RunExitCode.HostFailure,
			};
		}
	}

	let result: HarnessStartResult;
	let harness = null;
	const harnessCreateOptions: HarnessCreateOptions = {
		artifactOptions: {
			projectRoot: cwd,
			sourceFiles: entryFiles.map((entryFile) =>
				toPosixPath(relative(cwd, entryFile)),
			),
			updateSnapshots: artifactOptions.updateSnapshots === true,
		},
	};

	try {
		harness = runtime.createHarness(wasmBytes, harnessCreateOptions);
		result = await harness.start();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error(`Host execution failed: ${message}`);
		return {
			discoveredTestCount: 0,
			exitCode: RunExitCode.HostFailure,
		};
	} finally {
		harness?.close?.();
	}

	const report = createHarnessRunReport(result);
	if (!report.discoveryOk) {
		reporter.accept(report, { harnessName: runtime.name, logger });
		return {
			discoveredTestCount: report.discoveredTestCount,
			exitCode: RunExitCode.HostFailure,
		};
	}

	if (report.failedTestCount > 0 || report.blockedTestCount > 0) {
		reporter.accept(report, { harnessName: runtime.name, logger });
		if (coverageOptions.enabled && result.coverage) {
			logger.info(stringifyCoverage(result.coverage, coverageOptions.format));
		}
		return {
			discoveredTestCount: report.discoveredTestCount,
			exitCode: RunExitCode.TestFailure,
		};
	}

	reporter.accept(report, { harnessName: runtime.name, logger });
	if (coverageOptions.enabled && result.coverage) {
		logger.info(stringifyCoverage(result.coverage, coverageOptions.format));
	}
	return {
		discoveredTestCount: report.discoveredTestCount,
		exitCode: RunExitCode.Success,
	};
}
