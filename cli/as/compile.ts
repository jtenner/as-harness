import { readdir, readFile as readFileFromDisk } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createMemoryStream, main as runAsc } from "assemblyscript/asc";
import type { Runtime as HarnessRuntime } from "../runtime/types";
import { jsRuntime } from "../runtime/js";

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
  return Object.prototype.hasOwnProperty.call(compilerOptions, key);
}

function resolveFromBaseDir(path: string, baseDir: string): string {
  return resolve(baseDir, path);
}

async function readCompilerFile(filename: string, baseDir: string): Promise<string | null> {
  try {
    return await readFileFromDisk(resolveFromBaseDir(filename, baseDir), "utf8");
  } catch {
    return null;
  }
}

async function listCompilerFiles(dirname: string, baseDir: string): Promise<string[] | null> {
  try {
    const entries = await readdir(resolveFromBaseDir(dirname, baseDir));
    return entries.filter((entry) => SOURCE_FILE_PATTERN.test(entry)).map((entry) => join(dirname, entry));
  } catch {
    return null;
  }
}

function addBooleanFlag(argumentsList: string[], flag: string, enabled: boolean) {
  if (enabled) {
    argumentsList.push(flag);
  }
}

function addValueFlag(argumentsList: string[], flag: string, value: number | string | undefined) {
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
  if (hasCompilerOption(compilerOptions, "textFile") && compilerOptions.textFile) {
    argumentsList.push("--textFile", DEFAULT_TEXT_ARTIFACT_PATH);
  }
  if (hasCompilerOption(compilerOptions, "bindings") && compilerOptions.bindings) {
    argumentsList.push("--bindings", "raw");
  }
  if (hasCompilerOption(compilerOptions, "sourceMap")) {
    addBooleanFlag(argumentsList, "--sourceMap", compilerOptions.sourceMap);
  }
  if (hasCompilerOption(compilerOptions, "uncheckedBehavior")) {
    addValueFlag(argumentsList, "--uncheckedBehavior", compilerOptions.uncheckedBehavior);
  }
  if (hasCompilerOption(compilerOptions, "importMemory")) {
    addBooleanFlag(argumentsList, "--importMemory", compilerOptions.importMemory);
  }
  if (hasCompilerOption(compilerOptions, "noExportMemory")) {
    addBooleanFlag(argumentsList, "--noExportMemory", compilerOptions.noExportMemory);
  }
  if (hasCompilerOption(compilerOptions, "initialMemory")) {
    addValueFlag(argumentsList, "--initialMemory", compilerOptions.initialMemory);
  }
  if (hasCompilerOption(compilerOptions, "maximumMemory")) {
    addValueFlag(argumentsList, "--maximumMemory", compilerOptions.maximumMemory);
  }
  if (hasCompilerOption(compilerOptions, "sharedMemory")) {
    addBooleanFlag(argumentsList, "--sharedMemory", compilerOptions.sharedMemory);
  }
  if (hasCompilerOption(compilerOptions, "zeroFilledMemory")) {
    addBooleanFlag(argumentsList, "--zeroFilledMemory", compilerOptions.zeroFilledMemory);
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
    addBooleanFlag(argumentsList, "--exportRuntime", compilerOptions.exportRuntime);
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
    addValueFlag(argumentsList, "--lowMemoryLimit", compilerOptions.lowMemoryLimit);
  }
  if (hasCompilerOption(compilerOptions, "memoryBase")) {
    addValueFlag(argumentsList, "--memoryBase", compilerOptions.memoryBase);
  }
  if (hasCompilerOption(compilerOptions, "tableBase")) {
    addValueFlag(argumentsList, "--tableBase", compilerOptions.tableBase);
  }
  if (hasCompilerOption(compilerOptions, "transform")) {
    addRepeatedValueFlag(argumentsList, "--transform", compilerOptions.transform);
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
      addRepeatedValueFlag(argumentsList, "--disableWarning", compilerOptions.disableWarning);
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

export async function compile(compilerOptions: CompilerOptions): Promise<Artifact[]> {
  const artifacts = new Map<string, Artifact>();
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const harnessRuntime = jsRuntime;

  if (Object.keys(compilerOptions).length === 0) {
    return [];
  }

  const { error } = await runAsc(buildCompilerArguments(compilerOptions, harnessRuntime), {
    stdout,
    stderr,
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
  });

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
}
