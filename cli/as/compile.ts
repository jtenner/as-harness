import {
	mkdir,
	mkdtemp,
	readdir,
	readFile as readFileFromDisk,
	rm,
	writeFile as writeFileToDisk,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve } from "node:path";
import {
	createMemoryStream,
	libraryFiles as assemblyscriptLibraryFiles,
	libraryPrefix,
	main as runAsc,
} from "assemblyscript/asc";
import type { Runtime as HarnessRuntime } from "../runtime/types";
import { jsRuntime } from "../runtime/js";
import {
	bundledTransformFiles,
	bundledTransformRoot,
	bundledVirtualFiles,
	bundledVirtualRoot,
} from "./virtual-files.generated";
import assemblyscriptRuntimeDeclarations from "../node_modules/assemblyscript/std/assembly/rt/index.d.ts" with {
	type: "text",
};
import BundledStrictEqualityTransform from "../transform/src/index.ts";
import BundledCoverageTransform, {
	resetCoverageTransformOptions,
	setCoverageTransformOptions,
	type CoverageTransformOptions,
} from "../transform/src/covers.ts";

export type Binding = "raw";

export type UncheckedBehavior = "default" | "never" | "always";

export type AssemblyScriptRuntime = "incremental" | "minimal" | "stub" | string;

export type EnabledFeature =
	| "threads"
	| "simd"
	| "reference-types"
	| "gc"
	| "stringref"
	| "relaxed-simd"
	| string;

export type DisabledFeature =
	| "mutable-globals"
	| "sign-extension"
	| "nontrapping-f2i"
	| "bulk-memory"
	| string;

export type TrapMode = "allow" | "clamp" | "js";

// Modeled from `asc --help` so this covers the full CLI-facing compiler surface.
export type CompilerOptions = {
	config?: string;
	noAssert?: boolean;
	textFile?: boolean;
	bindings?: boolean;
	sourceMap?: boolean;
	uncheckedBehavior?: UncheckedBehavior;
	importMemory?: boolean;
	noExportMemory?: boolean;
	initialMemory?: number;
	maximumMemory?: number;
	sharedMemory?: boolean;
	zeroFilledMemory?: boolean;
	importTable?: boolean;
	exportTable?: boolean;
	runtime?: AssemblyScriptRuntime;
	exportRuntime?: boolean;
	stackSize?: number;
	enable?: EnabledFeature[];
	disable?: DisabledFeature[];
	use?: string[];
	lowMemoryLimit?: number;
	memoryBase?: number;
	tableBase?: number;
	transform?: string[];
	trapMode?: TrapMode;
	baseDir?: string;
	noUnsafe?: boolean;
	disableWarning?: boolean | number[];
	noEmit?: boolean;
	stats?: boolean;
	pedantic?: boolean;
	lib?: string[];
	path?: string[];
};

type InternalCompilerOptions = CompilerOptions & {
	coverageTransformOptions?: CoverageTransformOptions;
};

export type Artifact = {
	path: string;
	contents: Uint8Array;
	contentType: string;
};

const textEncoder = new TextEncoder();
// AssemblyScript's scaffolded debug build uses `asc ... --target debug`.
const DEFAULT_TARGET = "debug";
const DEFAULT_WASM_ARTIFACT_PATH = "output.wasm";
const DEFAULT_TEXT_ARTIFACT_PATH = "output.wat";
const SOURCE_FILE_PATTERN = /^(?!.*\.d\.ts$).*\.ts$/;
const TEMP_LIBRARY_DIRECTORY_PREFIX = "as-harness-lib-";
const TEMP_TRANSFORM_DIRECTORY_PREFIX = "as-harness-transform-";
export const BUNDLED_LIBRARY_COMPONENTS_PATH = `${bundledVirtualRoot}/lib`;
export const BUNDLED_STRICT_EQUALITY_TRANSFORM_PATH = `${bundledTransformRoot}/index.js`;
export const BUNDLED_COVERAGE_TRANSFORM_PATH = `${bundledTransformRoot}/covers.js`;
export const BUNDLED_HARNESS_EXPORTS_ENTRY_PATH = `${bundledVirtualRoot}/exports.ts`;
const BUNDLED_HARNESS_LIBRARY_ENTRY_POINTS = new Set([
	"as-harness",
	"node:test",
	"node:assert",
	"node:assert/strict",
	"jest",
	"vitest",
]);
const STRICT_EQUALITY_LIBRARY_ENTRY_POINTS = new Set([
	"node:assert",
	"node:assert/strict",
]);
const TRACE_COMPILE_FILE_SYSTEM =
	process.env.AS_HARNESS_TRACE_COMPILE_FS === "1";

type VirtualAssemblyFileSystem = {
	files: Map<string, string>;
	directories: Map<string, string[]>;
};

const ASSEMBLYSCRIPT_LIBRARY_ROOT = libraryPrefix.endsWith("/")
	? libraryPrefix.slice(0, -1)
	: libraryPrefix;
const virtualCompilerFiles = new Map<string, string>([
	...bundledVirtualFiles.entries(),
	...Object.entries(assemblyscriptLibraryFiles).map(
		([name, contents]) =>
			[`${ASSEMBLYSCRIPT_LIBRARY_ROOT}/${name}.ts`, contents] as const,
	),
	[
		`${ASSEMBLYSCRIPT_LIBRARY_ROOT}/rt/index.d.ts`,
		assemblyscriptRuntimeDeclarations,
	],
]);
const virtualAssemblyFileSystem = createVirtualFileSystem(virtualCompilerFiles);
const VIRTUAL_FILE_SYSTEM_ROOTS = [
	bundledVirtualRoot,
	ASSEMBLYSCRIPT_LIBRARY_ROOT,
] as const;

function traceCompileFileSystem(message: string) {
	if (TRACE_COMPILE_FILE_SYSTEM) {
		console.error(`[compile-fs] ${message}`);
	}
}

function toUint8Array(contents: string | Uint8Array): Uint8Array {
	return typeof contents === "string" ? textEncoder.encode(contents) : contents;
}

function inferContentType(path: string): string {
	if (path.endsWith(".wasm")) {
		return "application/wasm";
	}

	if (path.endsWith(".wat") || path.endsWith(".wast")) {
		return "text/plain; charset=utf-8";
	}

	if (path.endsWith(".js")) {
		return "text/javascript; charset=utf-8";
	}

	if (path.endsWith(".d.ts") || path.endsWith(".ts")) {
		return "text/plain; charset=utf-8";
	}

	if (path.endsWith(".map") || path.endsWith(".json")) {
		return "application/json; charset=utf-8";
	}

	return "application/octet-stream";
}

function hasCompilerOption<Key extends keyof CompilerOptions>(
	compilerOptions: CompilerOptions,
	key: Key,
): compilerOptions is CompilerOptions & Required<Pick<CompilerOptions, Key>> {
	return Object.hasOwn(compilerOptions, key);
}

function resolveFromBaseDir(path: string, baseDir: string): string {
	return resolve(baseDir, path);
}

function toPosixPath(path: string): string {
	return path.replaceAll("\\", "/");
}

function normalizeVirtualPath(path: string): string {
	return posix.normalize(toPosixPath(path));
}

function isBundledTransformPath(path: string): boolean {
	const normalizedPath = normalizeVirtualPath(path);
	return (
		normalizedPath === bundledTransformRoot ||
		normalizedPath.startsWith(`${bundledTransformRoot}/`)
	);
}

function isBundledLibraryPath(path: string): boolean {
	const normalizedPath = normalizeVirtualPath(path);
	return (
		normalizedPath === BUNDLED_LIBRARY_COMPONENTS_PATH ||
		normalizedPath.startsWith(`${BUNDLED_LIBRARY_COMPONENTS_PATH}/`)
	);
}

function shouldEnableBundledStrictEqualityTransform(
	compilerOptions: CompilerOptions,
): boolean {
	const libraries = compilerOptions.lib;
	return (
		Array.isArray(libraries) &&
		libraries.some(
			(library) =>
				STRICT_EQUALITY_LIBRARY_ENTRY_POINTS.has(library) ||
				isBundledLibraryPath(library),
		)
	);
}

export function withBundledHarnessLibraryComponents(
	compilerOptions: CompilerOptions,
): CompilerOptions {
	const libraries = compilerOptions.lib;
	if (!Array.isArray(libraries)) {
		return compilerOptions;
	}

	let usesBundledHarnessLibrary = false;
	const rewrittenLibraries: string[] = [];

	for (const library of libraries) {
		if (BUNDLED_HARNESS_LIBRARY_ENTRY_POINTS.has(library)) {
			usesBundledHarnessLibrary = true;
			continue;
		}

		rewrittenLibraries.push(library);
	}

	if (!usesBundledHarnessLibrary) {
		return compilerOptions;
	}

	if (!rewrittenLibraries.some((library) => isBundledLibraryPath(library))) {
		rewrittenLibraries.push(BUNDLED_LIBRARY_COMPONENTS_PATH);
	}

	return {
		...compilerOptions,
		lib: rewrittenLibraries,
	};
}

export function withBundledStrictEqualityTransform(
	compilerOptions: CompilerOptions,
): CompilerOptions {
	if (!shouldEnableBundledStrictEqualityTransform(compilerOptions)) {
		return compilerOptions;
	}

	const existingTransformPaths = compilerOptions.transform ?? [];
	const hasBundledStrictEqualityTransform = existingTransformPaths.some(
		(path) =>
			normalizeVirtualPath(path) ===
			normalizeVirtualPath(BUNDLED_STRICT_EQUALITY_TRANSFORM_PATH),
	);
	if (hasBundledStrictEqualityTransform) {
		return compilerOptions;
	}

	return {
		...compilerOptions,
		transform: [
			...existingTransformPaths,
			BUNDLED_STRICT_EQUALITY_TRANSFORM_PATH,
		],
	};
}

function ensureBundledLibraryPath(
	compilerOptions: CompilerOptions,
): CompilerOptions {
	const libraries = compilerOptions.lib;
	if (Array.isArray(libraries)) {
		if (libraries.some((library) => isBundledLibraryPath(library))) {
			return compilerOptions;
		}

		return {
			...compilerOptions,
			lib: [...libraries, BUNDLED_LIBRARY_COMPONENTS_PATH],
		};
	}

	return {
		...compilerOptions,
		lib: [BUNDLED_LIBRARY_COMPONENTS_PATH],
	};
}

export function withBundledCoverageTransform(
	compilerOptions: CompilerOptions,
	enabled: boolean | CoverageTransformOptions,
): CompilerOptions {
	if (!enabled) {
		return compilerOptions;
	}

	const internalCompilerOptions = compilerOptions as InternalCompilerOptions;
	const coverageTransformOptions =
		typeof enabled === "object"
			? enabled
			: internalCompilerOptions.coverageTransformOptions;
	const compilerOptionsWithLibrary = ensureBundledLibraryPath(compilerOptions);
	const existingTransformPaths = compilerOptionsWithLibrary.transform ?? [];
	const hasBundledCoverageTransform = existingTransformPaths.some(
		(path) =>
			normalizeVirtualPath(path) ===
			normalizeVirtualPath(BUNDLED_COVERAGE_TRANSFORM_PATH),
	);
	if (hasBundledCoverageTransform) {
		return coverageTransformOptions === undefined
			? compilerOptionsWithLibrary
			: ({
					...compilerOptionsWithLibrary,
					coverageTransformOptions,
				} as InternalCompilerOptions);
	}

	return {
		...compilerOptionsWithLibrary,
		...(coverageTransformOptions === undefined
			? {}
			: { coverageTransformOptions }),
		transform: [...existingTransformPaths, BUNDLED_COVERAGE_TRANSFORM_PATH],
	} as InternalCompilerOptions;
}

function resolveVirtualPath(path: string, baseDir: string): string | null {
	const normalizedPath = normalizeVirtualPath(path);
	const normalizedBaseDir = normalizeVirtualPath(baseDir);

	for (const root of VIRTUAL_FILE_SYSTEM_ROOTS) {
		if (normalizedPath === root || normalizedPath.startsWith(`${root}/`)) {
			return normalizedPath;
		}

		if (
			normalizedBaseDir === root ||
			normalizedBaseDir.startsWith(`${root}/`)
		) {
			return posix.normalize(posix.join(normalizedBaseDir, normalizedPath));
		}
	}

	return null;
}

function createVirtualFileSystem(
	files: ReadonlyMap<string, string>,
): VirtualAssemblyFileSystem {
	const directories = new Map<string, string[]>();

	for (const virtualPath of files.keys()) {
		let currentDirectory = posix.dirname(virtualPath);

		while (true) {
			if (!directories.has(currentDirectory)) {
				directories.set(currentDirectory, []);
			}

			const parentDirectory = posix.dirname(currentDirectory);
			if (parentDirectory === currentDirectory) {
				break;
			}

			currentDirectory = parentDirectory;
		}
	}

	for (const virtualPath of files.keys()) {
		const directory = posix.dirname(virtualPath);
		const entries = directories.get(directory);
		if (!entries) {
			continue;
		}

		entries.push(virtualPath);
		entries.sort();
	}

	return {
		files: new Map(files),
		directories,
	};
}

type PreparedCompilerOptions = {
	cleanup(): Promise<void>;
	compilerOptions: CompilerOptions;
	transforms: unknown[];
};

async function materializeBundledTransformDirectory(): Promise<string> {
	const directory = await mkdtemp(
		join(tmpdir(), TEMP_TRANSFORM_DIRECTORY_PREFIX),
	);

	for (const [virtualPath, contents] of bundledTransformFiles) {
		const relativePath = posix.relative(bundledTransformRoot, virtualPath);
		const outputPath = join(directory, ...relativePath.split("/"));
		await mkdir(dirname(outputPath), { recursive: true });
		await writeFileToDisk(outputPath, contents, "utf8");
	}

	return directory;
}

async function materializeBundledLibraryDirectory(): Promise<string> {
	const directory = await mkdtemp(
		join(tmpdir(), TEMP_LIBRARY_DIRECTORY_PREFIX),
	);

	for (const [virtualPath, contents] of bundledVirtualFiles) {
		if (!isBundledLibraryPath(virtualPath)) {
			continue;
		}

		const relativePath = posix.relative(
			BUNDLED_LIBRARY_COMPONENTS_PATH,
			virtualPath,
		);
		const outputPath = join(directory, ...relativePath.split("/"));
		await mkdir(dirname(outputPath), { recursive: true });
		await writeFileToDisk(outputPath, contents, "utf8");
	}

	return directory;
}

async function prepareCompilerOptions(
	compilerOptions: CompilerOptions,
): Promise<PreparedCompilerOptions> {
	const internalCompilerOptions = compilerOptions as InternalCompilerOptions;
	const compilerOptionsWithBundledSupport = withBundledHarnessLibraryComponents(
		withBundledStrictEqualityTransform(compilerOptions),
	);
	const cleanupTasks: Array<() => Promise<void>> = [];
	let rewrittenTransformPaths = compilerOptionsWithBundledSupport.transform;
	let rewrittenLibraryPaths = compilerOptionsWithBundledSupport.lib;
	const transforms: unknown[] = [];

	if (Array.isArray(rewrittenTransformPaths)) {
		const remainingTransformPaths: string[] = [];

		for (const transformPath of rewrittenTransformPaths) {
			if (
				normalizeVirtualPath(transformPath) ===
				normalizeVirtualPath(BUNDLED_STRICT_EQUALITY_TRANSFORM_PATH)
			) {
				transforms.push(BundledStrictEqualityTransform);
				continue;
			}

			if (
				normalizeVirtualPath(transformPath) ===
				normalizeVirtualPath(BUNDLED_COVERAGE_TRANSFORM_PATH)
			) {
				setCoverageTransformOptions(
					internalCompilerOptions.coverageTransformOptions,
				);
				cleanupTasks.push(async () => {
					resetCoverageTransformOptions();
				});
				transforms.push(BundledCoverageTransform);
				continue;
			}

			remainingTransformPaths.push(transformPath);
		}

		rewrittenTransformPaths =
			remainingTransformPaths.length > 0 ? remainingTransformPaths : undefined;
	}

	if (rewrittenTransformPaths?.some((path) => isBundledTransformPath(path))) {
		const materializedDirectory = await materializeBundledTransformDirectory();
		cleanupTasks.push(() =>
			rm(materializedDirectory, { force: true, recursive: true }),
		);
		rewrittenTransformPaths = rewrittenTransformPaths.map((path) => {
			if (!isBundledTransformPath(path)) {
				return path;
			}

			const relativePath = posix.relative(
				bundledTransformRoot,
				normalizeVirtualPath(path),
			);
			return join(materializedDirectory, ...relativePath.split("/"));
		});
	}

	if (
		process.platform !== "win32" &&
		rewrittenLibraryPaths?.some((path) => isBundledLibraryPath(path))
	) {
		const materializedDirectory = await materializeBundledLibraryDirectory();
		cleanupTasks.push(() =>
			rm(materializedDirectory, { force: true, recursive: true }),
		);
		rewrittenLibraryPaths = rewrittenLibraryPaths.map((path) => {
			if (!isBundledLibraryPath(path)) {
				return path;
			}

			const relativePath = posix.relative(
				BUNDLED_LIBRARY_COMPONENTS_PATH,
				normalizeVirtualPath(path),
			);
			return relativePath.length > 0
				? join(materializedDirectory, ...relativePath.split("/"))
				: materializedDirectory;
		});
	}

	return {
		async cleanup() {
			await Promise.all(cleanupTasks.map((cleanup) => cleanup()));
		},
		compilerOptions: {
			...compilerOptionsWithBundledSupport,
			transform: rewrittenTransformPaths,
			lib: rewrittenLibraryPaths,
		},
		transforms,
	};
}

async function readCompilerFile(
	filename: string,
	baseDir: string,
): Promise<string | null> {
	traceCompileFileSystem(`read ${filename} (base ${baseDir})`);

	const virtualPath = resolveVirtualPath(filename, baseDir);
	if (virtualPath) {
		const virtualFile = virtualAssemblyFileSystem.files.get(virtualPath);
		if (virtualFile !== undefined) {
			traceCompileFileSystem(`virtual hit ${virtualPath}`);
			return virtualFile;
		}
	}

	try {
		const contents = await readFileFromDisk(
			resolveFromBaseDir(filename, baseDir),
			"utf8",
		);
		traceCompileFileSystem(`disk hit ${resolveFromBaseDir(filename, baseDir)}`);
		return contents;
	} catch {
		traceCompileFileSystem(`miss ${resolveFromBaseDir(filename, baseDir)}`);

		const normalizedFilename = normalizeVirtualPath(filename);
		const normalizedBaseDir = normalizeVirtualPath(baseDir);
		const normalizedCurrentConfigPath = normalizeVirtualPath(
			join(process.cwd(), "asconfig.json"),
		);
		const normalizedResolvedPath = normalizeVirtualPath(
			resolveFromBaseDir(filename, baseDir),
		);
		if (
			normalizedFilename === "asconfig.json" &&
			normalizedBaseDir === normalizeVirtualPath(process.cwd()) &&
			normalizedResolvedPath === normalizedCurrentConfigPath
		) {
			traceCompileFileSystem(
				`virtual default config ${normalizedCurrentConfigPath}`,
			);
			return "{}\n";
		}

		return null;
	}
}

async function listCompilerFiles(
	dirname: string,
	baseDir: string,
): Promise<string[] | null> {
	traceCompileFileSystem(`list ${dirname} (base ${baseDir})`);

	const virtualDir = resolveVirtualPath(dirname, baseDir);
	if (virtualDir) {
		const virtualFiles = virtualAssemblyFileSystem.directories.get(virtualDir);
		if (virtualFiles !== undefined) {
			traceCompileFileSystem(`virtual list ${virtualDir}`);
			return virtualFiles;
		}
	}

	try {
		const entries = await readdir(resolveFromBaseDir(dirname, baseDir));
		traceCompileFileSystem(`disk list ${resolveFromBaseDir(dirname, baseDir)}`);
		return entries
			.filter((entry) => SOURCE_FILE_PATTERN.test(entry))
			.map((entry) => join(dirname, entry));
	} catch {
		traceCompileFileSystem(`list miss ${resolveFromBaseDir(dirname, baseDir)}`);
		return null;
	}
}

function addBooleanFlag(
	argumentsList: string[],
	flag: string,
	enabled: boolean,
) {
	if (enabled) {
		argumentsList.push(flag);
	}
}

function addValueFlag(
	argumentsList: string[],
	flag: string,
	value: number | string | undefined,
) {
	if (value !== undefined) {
		argumentsList.push(flag, String(value));
	}
}

function addRepeatedValueFlag(
	argumentsList: string[],
	flag: string,
	values: readonly (number | string)[] | undefined,
) {
	if (!values) {
		return;
	}

	for (const value of values) {
		argumentsList.push(flag, String(value));
	}
}

function buildCompilerArguments(
	compilerOptions: CompilerOptions,
	harnessRuntime: HarnessRuntime,
): string[] {
	const argumentsList: string[] = [
		"--target",
		DEFAULT_TARGET,
		"--outFile",
		DEFAULT_WASM_ARTIFACT_PATH,
		"--debug",
		"--exportStart",
		"",
		"--noColors",
	];

	if (hasCompilerOption(compilerOptions, "config")) {
		addValueFlag(argumentsList, "--config", compilerOptions.config);
	}
	if (hasCompilerOption(compilerOptions, "noAssert")) {
		addBooleanFlag(argumentsList, "--noAssert", compilerOptions.noAssert);
	}
	if (
		hasCompilerOption(compilerOptions, "textFile") &&
		compilerOptions.textFile
	) {
		argumentsList.push("--textFile", DEFAULT_TEXT_ARTIFACT_PATH);
	}
	if (
		hasCompilerOption(compilerOptions, "bindings") &&
		compilerOptions.bindings
	) {
		argumentsList.push("--bindings", "raw");
	}
	if (hasCompilerOption(compilerOptions, "sourceMap")) {
		addBooleanFlag(argumentsList, "--sourceMap", compilerOptions.sourceMap);
	}
	if (hasCompilerOption(compilerOptions, "uncheckedBehavior")) {
		addValueFlag(
			argumentsList,
			"--uncheckedBehavior",
			compilerOptions.uncheckedBehavior,
		);
	}
	if (hasCompilerOption(compilerOptions, "importMemory")) {
		addBooleanFlag(
			argumentsList,
			"--importMemory",
			compilerOptions.importMemory,
		);
	}
	if (hasCompilerOption(compilerOptions, "noExportMemory")) {
		addBooleanFlag(
			argumentsList,
			"--noExportMemory",
			compilerOptions.noExportMemory,
		);
	}
	if (hasCompilerOption(compilerOptions, "initialMemory")) {
		addValueFlag(
			argumentsList,
			"--initialMemory",
			compilerOptions.initialMemory,
		);
	}
	if (hasCompilerOption(compilerOptions, "maximumMemory")) {
		addValueFlag(
			argumentsList,
			"--maximumMemory",
			compilerOptions.maximumMemory,
		);
	}
	if (hasCompilerOption(compilerOptions, "sharedMemory")) {
		addBooleanFlag(
			argumentsList,
			"--sharedMemory",
			compilerOptions.sharedMemory,
		);
	}
	if (hasCompilerOption(compilerOptions, "zeroFilledMemory")) {
		addBooleanFlag(
			argumentsList,
			"--zeroFilledMemory",
			compilerOptions.zeroFilledMemory,
		);
	}
	if (hasCompilerOption(compilerOptions, "importTable")) {
		addBooleanFlag(argumentsList, "--importTable", compilerOptions.importTable);
	}
	if (hasCompilerOption(compilerOptions, "exportTable")) {
		addBooleanFlag(argumentsList, "--exportTable", compilerOptions.exportTable);
	}
	if (hasCompilerOption(compilerOptions, "runtime")) {
		addValueFlag(argumentsList, "--runtime", compilerOptions.runtime);
	}
	if (hasCompilerOption(compilerOptions, "exportRuntime")) {
		addBooleanFlag(
			argumentsList,
			"--exportRuntime",
			compilerOptions.exportRuntime,
		);
	}
	if (hasCompilerOption(compilerOptions, "stackSize")) {
		addValueFlag(argumentsList, "--stackSize", compilerOptions.stackSize);
	}
	if (hasCompilerOption(compilerOptions, "enable")) {
		addRepeatedValueFlag(argumentsList, "--enable", compilerOptions.enable);
	}
	if (hasCompilerOption(compilerOptions, "disable")) {
		addRepeatedValueFlag(argumentsList, "--disable", compilerOptions.disable);
	}
	if (hasCompilerOption(compilerOptions, "use")) {
		addRepeatedValueFlag(argumentsList, "--use", compilerOptions.use);
	}
	if (hasCompilerOption(compilerOptions, "lowMemoryLimit")) {
		addValueFlag(
			argumentsList,
			"--lowMemoryLimit",
			compilerOptions.lowMemoryLimit,
		);
	}
	if (hasCompilerOption(compilerOptions, "memoryBase")) {
		addValueFlag(argumentsList, "--memoryBase", compilerOptions.memoryBase);
	}
	if (hasCompilerOption(compilerOptions, "tableBase")) {
		addValueFlag(argumentsList, "--tableBase", compilerOptions.tableBase);
	}
	if (hasCompilerOption(compilerOptions, "transform")) {
		addRepeatedValueFlag(
			argumentsList,
			"--transform",
			compilerOptions.transform,
		);
	}
	if (hasCompilerOption(compilerOptions, "trapMode")) {
		addValueFlag(argumentsList, "--trapMode", compilerOptions.trapMode);
	}
	if (hasCompilerOption(compilerOptions, "baseDir")) {
		addValueFlag(argumentsList, "--baseDir", compilerOptions.baseDir);
	}
	if (hasCompilerOption(compilerOptions, "noUnsafe")) {
		addBooleanFlag(argumentsList, "--noUnsafe", compilerOptions.noUnsafe);
	}
	if (hasCompilerOption(compilerOptions, "disableWarning")) {
		if (compilerOptions.disableWarning === true) {
			argumentsList.push("--disableWarning");
		} else if (Array.isArray(compilerOptions.disableWarning)) {
			addRepeatedValueFlag(
				argumentsList,
				"--disableWarning",
				compilerOptions.disableWarning,
			);
		}
	}
	if (hasCompilerOption(compilerOptions, "noEmit")) {
		addBooleanFlag(argumentsList, "--noEmit", compilerOptions.noEmit);
	}
	if (hasCompilerOption(compilerOptions, "stats")) {
		addBooleanFlag(argumentsList, "--stats", compilerOptions.stats);
	}
	if (hasCompilerOption(compilerOptions, "pedantic")) {
		addBooleanFlag(argumentsList, "--pedantic", compilerOptions.pedantic);
	}
	if (hasCompilerOption(compilerOptions, "lib")) {
		addRepeatedValueFlag(argumentsList, "--lib", compilerOptions.lib);
	}
	if (hasCompilerOption(compilerOptions, "path")) {
		addRepeatedValueFlag(argumentsList, "--path", compilerOptions.path);
	}

	harnessRuntime.mutateCompilerArguments(argumentsList);

	return argumentsList;
}

function buildCompilationArguments(
	entryFiles: readonly string[],
	compilerOptions: CompilerOptions,
	harnessRuntime: HarnessRuntime,
) {
	return [
		...entryFiles,
		...buildCompilerArguments(compilerOptions, harnessRuntime),
	];
}

async function compileWithArguments(
	compilerOptions: CompilerOptions,
	createCompilerArguments: (
		preparedCompilerOptions: CompilerOptions,
	) => string[],
): Promise<Artifact[]> {
	const artifacts = new Map<string, Artifact>();
	const stdout = createMemoryStream();
	const stderr = createMemoryStream();
	const preparedCompilerOptions = await prepareCompilerOptions(compilerOptions);

	try {
		const { error } = await runAsc(
			createCompilerArguments(preparedCompilerOptions.compilerOptions),
			{
				stdout,
				stderr,
				transforms: preparedCompilerOptions.transforms,
				readFile(filename, baseDir) {
					return readCompilerFile(filename, baseDir);
				},
				writeFile(name, contents) {
					artifacts.set(name, {
						path: name,
						contents: toUint8Array(contents),
						contentType: inferContentType(name),
					});
				},
				listFiles(dirname, baseDir) {
					return listCompilerFiles(dirname, baseDir);
				},
			},
		);

		const stdoutText = stdout.toString();
		if (stdoutText.length > 0) {
			process.stdout.write(stdoutText);
		}

		const stderrText = stderr.toString();
		if (stderrText.length > 0) {
			process.stderr.write(stderrText);
		}

		if (error) {
			throw error;
		}

		return [...artifacts.values()];
	} finally {
		await preparedCompilerOptions.cleanup();
	}
}

export async function compile(
	compilerOptions: CompilerOptions,
): Promise<Artifact[]> {
	const harnessRuntime = jsRuntime;

	if (Object.keys(compilerOptions).length === 0) {
		return [];
	}

	return compileWithArguments(compilerOptions, (preparedCompilerOptions) =>
		buildCompilerArguments(preparedCompilerOptions, harnessRuntime),
	);
}

export async function compileEntrypoints(
	entryFiles: readonly string[],
	compilerOptions: CompilerOptions,
	harnessRuntime: HarnessRuntime = jsRuntime,
): Promise<Artifact[]> {
	if (entryFiles.length === 0) {
		return [];
	}

	return compileWithArguments(compilerOptions, (preparedCompilerOptions) =>
		buildCompilationArguments(
			entryFiles,
			preparedCompilerOptions,
			harnessRuntime,
		),
	);
}
