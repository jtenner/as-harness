import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, win32 } from "node:path";
import type {
	HarnessEvent,
	HarnessExecution,
	HarnessStartResult,
} from "../harness/shared/harness-types";
import { compileEntrypoints, type CompilerOptions } from "./as/compile";
import { jsRuntime } from "./runtime/js";
import { assertSupportedRuntime, resolveRuntime } from "./runtime/resolve";
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

const DEFAULT_RUN_LIBRARIES = [
	"node:test",
	"node:assert",
	"node:assert/strict",
] as const;
const TEMP_RUN_ENTRY_PREFIX = ".as-harness-run-";
const TEMP_RUN_ENTRY_BASENAME = "entry.ts";

type ExecutionFailure = {
	messages: string[];
	nodeName: string;
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
	wasmArtifacts: Awaited<ReturnType<typeof compileEntrypoints>>,
) {
	const wasmArtifact = wasmArtifacts.find((artifact) =>
		artifact.path.endsWith(".wasm"),
	);
	if (!wasmArtifact) {
		throw new Error("Compilation completed without emitting a wasm artifact.");
	}

	return wasmArtifact.contents;
}

function getFailMessageEvents(events: HarnessExecution["events"]) {
	return events.filter(
		(event): event is HarnessEvent<"failMessage"> =>
			event.type === "failMessage",
	);
}

function collectExecutionFailures(
	result: HarnessStartResult,
): ExecutionFailure[] {
	const failures: ExecutionFailure[] = [];

	for (const branch of result.branches) {
		for (const execution of branch.executions) {
			if (execution.ok) {
				continue;
			}

			const messages = getFailMessageEvents(execution.events).map(
				(event) => event.data.message,
			);
			failures.push({
				messages,
				nodeName: execution.node.name,
			});
		}
	}

	return failures;
}

function collectDiscoveryFailures(result: HarnessStartResult) {
	return result.branches
		.filter((branch) => !branch.discovery.ok)
		.map((branch) => branch.root.name);
}

function printSuccessSummary(
	result: HarnessStartResult,
	runtime: Runtime,
	logger: RunLogger,
) {
	logger.info(
		`PASS ${result.discoveredTestCount} test(s) across ${result.topLevelNodes.length} top-level node(s) with ${runtime.name}.`,
	);
}

function printExecutionFailureSummary(
	result: HarnessStartResult,
	failures: readonly ExecutionFailure[],
	runtime: Runtime,
	logger: RunLogger,
) {
	logger.error(
		`FAIL ${failures.length} test(s) failed out of ${result.discoveredTestCount} discovered with ${runtime.name}.`,
	);

	for (const failure of failures) {
		if (failure.messages.length === 0) {
			logger.error(`- ${failure.nodeName}: failed without a fail message`);
			continue;
		}

		for (const message of failure.messages) {
			logger.error(`- ${failure.nodeName}: ${message}`);
		}
	}
}

function printDiscoveryFailureSummary(
	discoveryFailures: readonly string[],
	runtime: Runtime,
	logger: RunLogger,
) {
	logger.error(
		`Discovery failed while traversing the test tree with ${runtime.name}.`,
	);

	for (const nodeName of discoveryFailures) {
		logger.error(`- ${nodeName}`);
	}
}

export async function runEntryFiles(
	entryFiles: readonly string[],
	cwd: string,
	logger: RunLogger,
	runtimeSelection: Runtime | string | undefined = jsRuntime,
	compilerOptions: CompilerOptions = {},
): Promise<RunCommandResult> {
	let wasmBytes: Uint8Array;
	const temporaryEntrypoint = await createRunEntrypoint(entryFiles, cwd);
	let compileRuntime = jsRuntime;

	if (typeof runtimeSelection !== "string") {
		compileRuntime = runtimeSelection;
	} else {
		try {
			assertSupportedRuntime(runtimeSelection);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error(`Harness resolution failed: ${message}`);
			await temporaryEntrypoint.cleanup();
			return {
				discoveredTestCount: 0,
				exitCode: RunExitCode.HostFailure,
			};
		}
	}

	try {
		const artifacts = await compileEntrypoints(
			[temporaryEntrypoint.path],
			mergeRunCompilerOptions(cwd, compilerOptions),
			compileRuntime,
		);
		wasmBytes = getWasmArtifactBytes(artifacts);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error(`Compilation failed: ${message}`);
		return {
			discoveredTestCount: 0,
			exitCode: RunExitCode.CompileFailure,
		};
	} finally {
		await temporaryEntrypoint.cleanup();
	}

	let runtime: Runtime;

	try {
		runtime =
			typeof runtimeSelection === "string"
				? await resolveRuntime(runtimeSelection)
				: runtimeSelection;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error(`Harness resolution failed: ${message}`);
		return {
			discoveredTestCount: 0,
			exitCode: RunExitCode.HostFailure,
		};
	}

	let result: HarnessStartResult;
	let harness = null;

	try {
		harness = runtime.createHarness(wasmBytes);
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

	const discoveryFailures = collectDiscoveryFailures(result);
	if (discoveryFailures.length > 0) {
		printDiscoveryFailureSummary(discoveryFailures, runtime, logger);
		return {
			discoveredTestCount: result.discoveredTestCount,
			exitCode: RunExitCode.HostFailure,
		};
	}

	const executionFailures = collectExecutionFailures(result);
	if (executionFailures.length > 0) {
		printExecutionFailureSummary(result, executionFailures, runtime, logger);
		return {
			discoveredTestCount: result.discoveredTestCount,
			exitCode: RunExitCode.TestFailure,
		};
	}

	printSuccessSummary(result, runtime, logger);
	return {
		discoveredTestCount: result.discoveredTestCount,
		exitCode: RunExitCode.Success,
	};
}
