#!/usr/bin/env bun

import { stat } from "node:fs/promises";
import {
	basename,
	dirname,
	isAbsolute,
	relative,
	resolve,
	sep,
} from "node:path";
import type { CompilerOptions } from "./as/compile";
import packageJson from "./package.json";
import { runEntryFiles } from "./run";

const CLI_NAME = "as-harness";
const CLI_VERSION = packageJson.version;
const DEFAULT_ENTRY_GLOBS = ["**/*.{test,spec}.ts", "test/**/*.ts"] as const;

type CommandName = "help" | "list" | "run" | "version";

export type ParsedCommand = {
	command: CommandName;
	helpTarget?: "general" | "run";
	ordinals: string[];
	useGlobOrdinals: boolean;
	coverage: boolean;
	coverageFormat?: string;
	harness?: string;
	compilerOptions: CompilerOptions;
	ignore: string[];
};

function toPosixPath(path: string) {
	return path.split(sep).join("/");
}

function printHelp() {
	console.log(`${CLI_NAME} ${CLI_VERSION}

Usage:
  ${CLI_NAME} help
  ${CLI_NAME} list [options] [entry-path ...]
  ${CLI_NAME} run [options] [entry-path ...]

Commands:
  help                 Show this help text
  list                 List discovered entry files
  run                  Resolve entry files, compile them, and execute them

Entry Discovery:
  Ordinal arguments are treated as file paths by default.
  If no ordinals are provided, the default entry globs are:
    ${DEFAULT_ENTRY_GLOBS[0]}
    ${DEFAULT_ENTRY_GLOBS[1]}

Options:
  -h, --help             Show this help text
  -v, --version          Show the CLI version
  -g, --glob             Interpret ordinal arguments as glob patterns
  --coverage             Enable code coverage output (currently disabled)
  --coverage-format fmt  Coverage format placeholder
  --harness name         Select the execution harness (\`js\` by default)
  -i, --ignore glob      Glob matcher that excludes an entry point`);
}

function printRunHelp() {
	console.log(`${CLI_NAME} run

Usage:
  ${CLI_NAME} run [options] [entry-path ...]

Entry Discovery:
  Ordinal arguments are treated as file paths by default.
  If no ordinals are provided, the default entry globs are:
    ${DEFAULT_ENTRY_GLOBS[0]}
    ${DEFAULT_ENTRY_GLOBS[1]}

Run Options:
  -h, --help                 Show help for the run command
  -g, --glob                 Interpret ordinal arguments as glob patterns
  --coverage                 Enable code coverage output (currently disabled)
  --coverage-format fmt      Coverage format placeholder
  --harness name             Select the execution harness (\`js\` | \`wazero\`)
  -i, --ignore glob          Glob matcher that excludes an entry point

Compiler Options:
  --config path              Apply an asconfig file
  --noAssert                 Disable assertion traps
  --textFile                 Emit the text artifact (.wat)
  --bindings                 Emit raw bindings
  --sourceMap                Emit a source map
  --uncheckedBehavior mode   default | never | always
  --importMemory             Import memory from env.memory
  --noExportMemory           Do not export memory
  --initialMemory pages      Set initial memory size
  --maximumMemory pages      Set maximum memory size
  --sharedMemory             Declare memory as shared
  --zeroFilledMemory         Assume imported memory is zero-filled
  --importTable              Import the function table
  --exportTable              Export the function table
  --runtime runtime          incremental | minimal | stub | custom path
  --exportRuntime            Export runtime helpers
  --stackSize size           Override the stack size
  --enable feature           Enable a WebAssembly feature
  --disable feature          Disable a WebAssembly feature
  --use alias                Alias a global or define an integer constant
  --lowMemoryLimit value     Enforce very low memory constraints
  --memoryBase offset        Set the emitted memory base
  --tableBase offset         Set the emitted table base
  --transform path           Load a custom transform
  --trapMode mode            allow | clamp | js
  --baseDir path             Set the compiler base directory
  --noUnsafe                 Disallow unsafe features in user code
  --disableWarning [code]    Disable warnings, optionally by diagnostic code
  --noEmit                   Compile without emitting outputs
  --stats                    Print compiler timing stats
  --pedantic                 Enable pedantic diagnostics
  --lib path                 Add a custom library component path
  --path path                Add a package resolution path

Forced Compiler Defaults:
  --target debug
  --outFile output.wasm
  --debug
  --exportStart ""
  --noColors`);
}

function isOption(token: string) {
	return token.startsWith("-");
}

function matchesGlobPattern(candidatePath: string, pattern: string) {
	const glob = new Bun.Glob(pattern);
	return glob.match(candidatePath);
}

function displayPath(absolutePath: string, cwd: string) {
	const relativePath = toPosixPath(relative(cwd, absolutePath));
	return relativePath === "" || relativePath.startsWith("..")
		? toPosixPath(absolutePath)
		: relativePath;
}

function splitGlobPattern(pattern: string, cwd: string) {
	const normalizedPattern = toPosixPath(pattern);
	const firstMagicIndex = normalizedPattern.search(/[*?[{!]/);

	if (firstMagicIndex === -1) {
		const absolutePattern = isAbsolute(pattern)
			? pattern
			: resolve(cwd, pattern);
		return {
			scanCwd: dirname(absolutePattern),
			scanPattern: basename(absolutePattern),
		};
	}

	const prefix = normalizedPattern.slice(0, firstMagicIndex);
	const lastSlashIndex = prefix.lastIndexOf("/");
	const rootPrefix =
		lastSlashIndex === -1 ? "" : normalizedPattern.slice(0, lastSlashIndex + 1);
	const scanPattern = normalizedPattern.slice(rootPrefix.length) || "**/*";
	const scanCwd = isAbsolute(pattern)
		? rootPrefix || "/"
		: resolve(cwd, rootPrefix || ".");

	return { scanCwd, scanPattern };
}

async function expandGlob(pattern: string, cwd: string) {
	const { scanCwd, scanPattern } = splitGlobPattern(pattern, cwd);
	const glob = new Bun.Glob(scanPattern);
	const matches: string[] = [];

	for await (const matchedPath of glob.scan({ cwd: scanCwd })) {
		matches.push(resolve(scanCwd, matchedPath));
	}

	return matches;
}

async function resolveFileOrdinal(pathLike: string, cwd: string) {
	const resolvedPath = resolve(cwd, pathLike);

	try {
		const stats = await stat(resolvedPath);
		return stats.isFile() ? resolvedPath : null;
	} catch {
		return null;
	}
}

function shouldIgnoreEntry(
	absolutePath: string,
	cwd: string,
	ignorePatterns: string[],
) {
	if (ignorePatterns.length === 0) {
		return false;
	}

	const relativePath = displayPath(absolutePath, cwd);
	const absolutePosixPath = toPosixPath(absolutePath);
	return ignorePatterns.some(
		(pattern) =>
			matchesGlobPattern(relativePath, pattern) ||
			matchesGlobPattern(absolutePosixPath, pattern),
	);
}

async function discoverEntryFiles(command: ParsedCommand, cwd: string) {
	const candidates = new Set<string>();

	if (command.ordinals.length === 0) {
		for (const pattern of DEFAULT_ENTRY_GLOBS) {
			for (const match of await expandGlob(pattern, cwd)) {
				candidates.add(match);
			}
		}
	} else if (command.useGlobOrdinals) {
		for (const pattern of command.ordinals) {
			for (const match of await expandGlob(pattern, cwd)) {
				candidates.add(match);
			}
		}
	} else {
		for (const ordinal of command.ordinals) {
			const match = await resolveFileOrdinal(ordinal, cwd);
			if (match) {
				candidates.add(match);
			}
		}
	}

	return [...candidates]
		.filter((entryPath) => !shouldIgnoreEntry(entryPath, cwd, command.ignore))
		.sort((left, right) =>
			displayPath(left, cwd).localeCompare(displayPath(right, cwd)),
		);
}

function parseOptionValue(args: string[], index: number, flag: string) {
	const nextValue = args[index + 1];
	if (!nextValue) {
		throw new Error(`Missing value for ${flag}`);
	}
	return nextValue;
}

function parseIntegerOptionValue(args: string[], index: number, flag: string) {
	const value = parseOptionValue(args, index, flag);
	const parsed = Number.parseInt(value, 10);
	if (!Number.isInteger(parsed)) {
		throw new Error(`Invalid integer for ${flag}: ${value}`);
	}
	return parsed;
}

function parseIntegerInlineValue(flag: string, value: string) {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isInteger(parsed)) {
		throw new Error(`Invalid integer for ${flag}: ${value}`);
	}
	return parsed;
}

function appendStringOption(target: string[] | undefined, value: string) {
	if (target) {
		target.push(value);
		return target;
	}

	return [value];
}

function appendNumberOption(target: number[] | undefined, value: number) {
	if (target) {
		target.push(value);
		return target;
	}

	return [value];
}

function parseDisableWarningOption(
	args: string[],
	index: number,
	compilerOptions: CompilerOptions,
) {
	const nextValue = args[index + 1];
	if (
		nextValue === undefined ||
		isOption(nextValue) ||
		!/^\d+$/.test(nextValue)
	) {
		compilerOptions.disableWarning = true;
		return 0;
	}

	compilerOptions.disableWarning = appendNumberOption(
		Array.isArray(compilerOptions.disableWarning)
			? compilerOptions.disableWarning
			: undefined,
		parseIntegerOptionValue(args, index, "--disableWarning"),
	);
	return 1;
}

function parseRunCompilerOption(
	args: string[],
	index: number,
	compilerOptions: CompilerOptions,
) {
	const token = args[index];
	if (token === undefined) {
		return 0;
	}

	switch (token) {
		case "--config":
			compilerOptions.config = parseOptionValue(args, index, token);
			return 1;
		case "--noAssert":
			compilerOptions.noAssert = true;
			return 0;
		case "--textFile":
			compilerOptions.textFile = true;
			return 0;
		case "--bindings":
			compilerOptions.bindings = true;
			return 0;
		case "--sourceMap":
			compilerOptions.sourceMap = true;
			return 0;
		case "--uncheckedBehavior":
			compilerOptions.uncheckedBehavior = parseOptionValue(args, index, token);
			return 1;
		case "--importMemory":
			compilerOptions.importMemory = true;
			return 0;
		case "--noExportMemory":
			compilerOptions.noExportMemory = true;
			return 0;
		case "--initialMemory":
			compilerOptions.initialMemory = parseIntegerOptionValue(
				args,
				index,
				token,
			);
			return 1;
		case "--maximumMemory":
			compilerOptions.maximumMemory = parseIntegerOptionValue(
				args,
				index,
				token,
			);
			return 1;
		case "--sharedMemory":
			compilerOptions.sharedMemory = true;
			return 0;
		case "--zeroFilledMemory":
			compilerOptions.zeroFilledMemory = true;
			return 0;
		case "--importTable":
			compilerOptions.importTable = true;
			return 0;
		case "--exportTable":
			compilerOptions.exportTable = true;
			return 0;
		case "--runtime":
			compilerOptions.runtime = parseOptionValue(args, index, token);
			return 1;
		case "--exportRuntime":
			compilerOptions.exportRuntime = true;
			return 0;
		case "--stackSize":
			compilerOptions.stackSize = parseIntegerOptionValue(args, index, token);
			return 1;
		case "--enable":
			compilerOptions.enable = appendStringOption(
				compilerOptions.enable,
				parseOptionValue(args, index, token),
			);
			return 1;
		case "--disable":
			compilerOptions.disable = appendStringOption(
				compilerOptions.disable,
				parseOptionValue(args, index, token),
			);
			return 1;
		case "--use":
			compilerOptions.use = appendStringOption(
				compilerOptions.use,
				parseOptionValue(args, index, token),
			);
			return 1;
		case "--lowMemoryLimit":
			compilerOptions.lowMemoryLimit = parseIntegerOptionValue(
				args,
				index,
				token,
			);
			return 1;
		case "--memoryBase":
			compilerOptions.memoryBase = parseIntegerOptionValue(args, index, token);
			return 1;
		case "--tableBase":
			compilerOptions.tableBase = parseIntegerOptionValue(args, index, token);
			return 1;
		case "--transform":
			compilerOptions.transform = appendStringOption(
				compilerOptions.transform,
				parseOptionValue(args, index, token),
			);
			return 1;
		case "--trapMode":
			compilerOptions.trapMode = parseOptionValue(args, index, token);
			return 1;
		case "--baseDir":
			compilerOptions.baseDir = parseOptionValue(args, index, token);
			return 1;
		case "--noUnsafe":
			compilerOptions.noUnsafe = true;
			return 0;
		case "--disableWarning":
			return parseDisableWarningOption(args, index, compilerOptions);
		case "--noEmit":
			compilerOptions.noEmit = true;
			return 0;
		case "--stats":
			compilerOptions.stats = true;
			return 0;
		case "--pedantic":
			compilerOptions.pedantic = true;
			return 0;
		case "--lib":
			compilerOptions.lib = appendStringOption(
				compilerOptions.lib,
				parseOptionValue(args, index, token),
			);
			return 1;
		case "--path":
			compilerOptions.path = appendStringOption(
				compilerOptions.path,
				parseOptionValue(args, index, token),
			);
			return 1;
		default:
			break;
	}

	if (token.startsWith("--config=")) {
		compilerOptions.config = token.slice("--config=".length);
		return 0;
	}
	if (token.startsWith("--uncheckedBehavior=")) {
		compilerOptions.uncheckedBehavior = token.slice(
			"--uncheckedBehavior=".length,
		);
		return 0;
	}
	if (token.startsWith("--initialMemory=")) {
		compilerOptions.initialMemory = parseIntegerInlineValue(
			"--initialMemory",
			token.slice("--initialMemory=".length),
		);
		return 0;
	}
	if (token.startsWith("--maximumMemory=")) {
		compilerOptions.maximumMemory = parseIntegerInlineValue(
			"--maximumMemory",
			token.slice("--maximumMemory=".length),
		);
		return 0;
	}
	if (token.startsWith("--runtime=")) {
		compilerOptions.runtime = token.slice("--runtime=".length);
		return 0;
	}
	if (token.startsWith("--stackSize=")) {
		compilerOptions.stackSize = parseIntegerInlineValue(
			"--stackSize",
			token.slice("--stackSize=".length),
		);
		return 0;
	}
	if (token.startsWith("--enable=")) {
		compilerOptions.enable = appendStringOption(
			compilerOptions.enable,
			token.slice("--enable=".length),
		);
		return 0;
	}
	if (token.startsWith("--disable=")) {
		compilerOptions.disable = appendStringOption(
			compilerOptions.disable,
			token.slice("--disable=".length),
		);
		return 0;
	}
	if (token.startsWith("--use=")) {
		compilerOptions.use = appendStringOption(
			compilerOptions.use,
			token.slice("--use=".length),
		);
		return 0;
	}
	if (token.startsWith("--lowMemoryLimit=")) {
		compilerOptions.lowMemoryLimit = parseIntegerInlineValue(
			"--lowMemoryLimit",
			token.slice("--lowMemoryLimit=".length),
		);
		return 0;
	}
	if (token.startsWith("--memoryBase=")) {
		compilerOptions.memoryBase = parseIntegerInlineValue(
			"--memoryBase",
			token.slice("--memoryBase=".length),
		);
		return 0;
	}
	if (token.startsWith("--tableBase=")) {
		compilerOptions.tableBase = parseIntegerInlineValue(
			"--tableBase",
			token.slice("--tableBase=".length),
		);
		return 0;
	}
	if (token.startsWith("--transform=")) {
		compilerOptions.transform = appendStringOption(
			compilerOptions.transform,
			token.slice("--transform=".length),
		);
		return 0;
	}
	if (token.startsWith("--trapMode=")) {
		compilerOptions.trapMode = token.slice("--trapMode=".length);
		return 0;
	}
	if (token.startsWith("--baseDir=")) {
		compilerOptions.baseDir = token.slice("--baseDir=".length);
		return 0;
	}
	if (token.startsWith("--disableWarning=")) {
		compilerOptions.disableWarning = appendNumberOption(
			Array.isArray(compilerOptions.disableWarning)
				? compilerOptions.disableWarning
				: undefined,
			parseIntegerInlineValue(
				"--disableWarning",
				token.slice("--disableWarning=".length),
			),
		);
		return 0;
	}
	if (token.startsWith("--lib=")) {
		compilerOptions.lib = appendStringOption(
			compilerOptions.lib,
			token.slice("--lib=".length),
		);
		return 0;
	}
	if (token.startsWith("--path=")) {
		compilerOptions.path = appendStringOption(
			compilerOptions.path,
			token.slice("--path=".length),
		);
		return 0;
	}

	return null;
}

export function parseCommand(args: string[]): ParsedCommand {
	if (args.length === 0) {
		return {
			command: "help",
			helpTarget: "general",
			ordinals: [],
			useGlobOrdinals: false,
			coverage: false,
			compilerOptions: {},
			ignore: [],
		};
	}

	if (args[0] === "help" || args[0] === "--help" || args[0] === "-h") {
		return {
			command: "help",
			helpTarget: "general",
			ordinals: [],
			useGlobOrdinals: false,
			coverage: false,
			compilerOptions: {},
			ignore: [],
		};
	}

	if (args[0] === "--version" || args[0] === "-v") {
		return {
			command: "version",
			helpTarget: undefined,
			ordinals: [],
			useGlobOrdinals: false,
			coverage: false,
			compilerOptions: {},
			ignore: [],
		};
	}

	if (args[0] !== "list" && args[0] !== "run") {
		throw new Error(`Unknown command: ${args[0]}`);
	}

	const parsed: ParsedCommand = {
		command: args[0],
		helpTarget: undefined,
		ordinals: [],
		useGlobOrdinals: false,
		coverage: false,
		compilerOptions: {},
		ignore: [],
	};

	for (let index = 1; index < args.length; index += 1) {
		const token = args[index];

		if (token === undefined) {
			break;
		}

		if (token === "--help" || token === "-h") {
			parsed.command = "help";
			parsed.helpTarget = args[0] === "run" ? "run" : "general";
			parsed.ordinals.length = 0;
			return parsed;
		}

		if (token === "--") {
			parsed.ordinals.push(...args.slice(index + 1));
			break;
		}

		if (token === "--glob" || token === "-g") {
			parsed.useGlobOrdinals = true;
			continue;
		}

		if (token === "--coverage") {
			parsed.coverage = true;
			continue;
		}

		if (token === "--harness") {
			parsed.harness = parseOptionValue(args, index, token);
			index += 1;
			continue;
		}

		if (token.startsWith("--harness=")) {
			parsed.harness = token.slice("--harness=".length);
			continue;
		}

		if (parsed.command === "run") {
			const consumedValues = parseRunCompilerOption(
				args,
				index,
				parsed.compilerOptions,
			);
			if (consumedValues !== null) {
				index += consumedValues;
				continue;
			}
		}

		if (token === "--coverage-format") {
			parsed.coverageFormat = parseOptionValue(args, index, token);
			index += 1;
			continue;
		}

		if (token.startsWith("--coverage-format=")) {
			parsed.coverageFormat = token.slice("--coverage-format=".length);
			continue;
		}

		if (token === "--ignore" || token === "-i") {
			parsed.ignore.push(parseOptionValue(args, index, token));
			index += 1;
			continue;
		}

		if (token.startsWith("--ignore=")) {
			parsed.ignore.push(token.slice("--ignore=".length));
			continue;
		}

		if (isOption(token)) {
			throw new Error(`Unknown option: ${token}`);
		}

		parsed.ordinals.push(token);
	}

	return parsed;
}

async function runListCommand(command: ParsedCommand, cwd: string) {
	const entries = await discoverEntryFiles(command, cwd);
	for (const entry of entries) {
		console.log(displayPath(entry, cwd));
	}
}

async function runRunCommand(command: ParsedCommand, cwd: string) {
	const entries = await discoverEntryFiles(command, cwd);

	if (entries.length === 0) {
		console.error("No entry files found.");
		process.exitCode = 1;
		return;
	}

	if (command.coverage) {
		console.error("Coverage is not implemented yet.");
	}

	const result = await runEntryFiles(
		entries,
		cwd,
		{
			error(message) {
				console.error(message);
			},
			info(message) {
				console.log(message);
			},
		},
		command.harness,
		command.compilerOptions,
	);
	process.exitCode = result.exitCode;
}

async function main(args: string[]) {
	try {
		const parsed = parseCommand(args);
		const cwd = process.cwd();

		if (parsed.command === "help") {
			if (parsed.helpTarget === "run") {
				printRunHelp();
			} else {
				printHelp();
			}
			return;
		}

		if (parsed.command === "version") {
			console.log(CLI_VERSION);
			return;
		}

		if (parsed.command === "list") {
			await runListCommand(parsed, cwd);
			return;
		}

		await runRunCommand(parsed, cwd);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(message);
		console.error(`Run '${CLI_NAME} --help' to see available options.`);
		process.exitCode = 1;
	}
}

if (import.meta.main) {
	await main(process.argv.slice(2));
}
