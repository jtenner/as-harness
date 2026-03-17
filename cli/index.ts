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
import packageJson from "./package.json";
import { runEntryFiles } from "./run";

const CLI_NAME = "as-harness";
const CLI_VERSION = packageJson.version;
const DEFAULT_ENTRY_GLOBS = ["**/*.{test,spec}.ts", "test/**/*.ts"] as const;

type CommandName = "help" | "list" | "run" | "version";

type ParsedCommand = {
	command: CommandName;
	helpTarget?: "general" | "run";
	ordinals: string[];
	useGlobOrdinals: boolean;
	coverage: boolean;
	coverageFormat?: string;
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

function parseCommand(args: string[]): ParsedCommand {
	if (args.length === 0) {
		return {
			command: "help",
			helpTarget: "general",
			ordinals: [],
			useGlobOrdinals: false,
			coverage: false,
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

	const result = await runEntryFiles(entries, cwd, {
		error(message) {
			console.error(message);
		},
		info(message) {
			console.log(message);
		},
	});
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

await main(process.argv.slice(2));
