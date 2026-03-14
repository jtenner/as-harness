# `@as-harness/cli`

`cli/` is a standalone Bun package that is being used to prototype a runnable
AssemblyScript test harness CLI. The package is intentionally scaffold-first:
the executable, command surface, compiler wrapper, runtime abstraction, and
build matrix all exist now, while the actual compilation and test execution
workflow is still being defined.

## Current Status

What exists today:

- A Bun-based executable entrypoint at `index.ts`
- A multi-target `bun --compile` build pipeline
- A command parser with `help`, `list`, and scaffolded `run` commands
- Entry file discovery with default globs, explicit file paths, glob mode, and
  ignore filters
- A programmatic AssemblyScript compiler wrapper in `as/compile.ts`
- A scaffolded `transform/` area for future strict-equality AST instrumentation
- A runtime abstraction layer in `runtime/`
- A placeholder `n-api/` directory for bundled native modules

What is intentionally incomplete:

- `run` does not execute compilations yet
- coverage flags are parsed, but coverage is disabled
- runtime-specific compiler argument mutations are scaffolded, but still empty
- the CLI documents compiler flags for `run`, but they are not yet parsed from
  the CLI command line and forwarded into `as/compile.ts`

## Package Layout

Key files and directories:

- `index.ts`
  The CLI entrypoint. Handles subcommands, help output, entry discovery, and
  scaffolding for `run`.
- `build.ts`
  The standalone executable build script. Produces one binary per supported Bun
  compile target and also powers `clean` and target listing.
- `as/compile.ts`
  The programmatic AssemblyScript compiler wrapper. It builds an `asc` argument
  list, injects a runtime harness, overlays bundled virtual AssemblyScript
  sources under `~/.as-harness`, captures emitted compiler artifacts in memory,
  and returns them as structured objects.
- `as/generate-virtual-files.ts`
  Generates the bundled virtual-file module used by the compiler wrapper. It
  scans `../assembly/assembly/**/*.ts`, builds a temporary text-import barrel,
  and emits a TypeScript module containing the file contents as strings.
- `as/virtual-files.generated.ts`
  Generated source data for the bundled `~/.as-harness` virtual filesystem used
  by the compiler wrapper.
- `transform/`
  Scaffold for the future AssemblyScript transform that will inject
  strict-equality and reflected-diagnostics hooks into class declarations. The
  bundled CLI generation step also emits precompiled JS transform files that can
  be hoisted to temp paths before invoking `asc`.
- `runtime/types.ts`
  Defines the `Runtime` interface used to mutate compiler arguments.
- `runtime/js.ts`, `runtime/wasmtime.ts`, `runtime/wazero.ts`
  Runtime harness placeholders that implement the shared interface.
- `n-api/`
  Reserved for bundled native modules that will be included with the CLI.

## Scripts

Install dependencies:

```bash
bun install
```

Run the CLI from source:

```bash
bun run dev
```

Remove all compiled build output:

```bash
bun run clean
```

Build standalone executables for every supported Bun compile target:

```bash
bun run build
```

Print the compile target matrix:

```bash
bun run build:list-targets
```

## Standalone Executable Build

The package is set up so Bun can compile the CLI into standalone executables
with `--compile`. The build script clears `dist/` first, then emits one binary
per supported target into `dist/<target>/`.

Before building executables, `build.ts` regenerates the bundled virtual
AssemblyScript file module so the compiled CLI carries the current
`assembly/assembly/**/*.ts` source text without depending on that repo path at
runtime.

The current target matrix is:

- `bun-darwin-x64`
- `bun-darwin-x64-baseline`
- `bun-darwin-x64-modern`
- `bun-darwin-arm64`
- `bun-linux-x64`
- `bun-linux-x64-baseline`
- `bun-linux-x64-modern`
- `bun-linux-arm64`
- `bun-linux-x64-musl`
- `bun-linux-x64-baseline-musl`
- `bun-linux-x64-modern-musl`
- `bun-linux-arm64-musl`
- `bun-windows-x64`
- `bun-windows-x64-baseline`
- `bun-windows-x64-modern`

Windows binaries are emitted with `.exe`; the others are emitted without an
extension.

## Command Surface

### Top-level commands

- `help`
- `--help`
- `list`
- `run`
- `--version`

### `list`

`list` resolves and prints entry files.

Examples:

```bash
bun run dev -- list test/example.spec.ts
bun run dev -- list --glob "test/**/*.ts"
bun run dev -- list --ignore "fixtures/**"
```

### `run`

`run` is currently a scaffold. It resolves entry files the same way as `list`,
prints a not-yet-implemented message, and exits with a failure code. This is
intentional so the command surface can settle before execution behavior is
locked in.

`run --help` currently documents:

- entry discovery flags
- coverage placeholders
- the AssemblyScript compiler flag surface that the harness intends to expose
- the compiler defaults that are forced by the harness

That help screen is informational at this stage. The actual CLI parser does not
yet forward all documented compiler flags into `as/compile.ts`.

## Entry Discovery

Entry discovery rules implemented in `index.ts`:

- Ordinal arguments are treated as file paths by default
- Relative file paths are resolved from the current working directory
- Absolute file paths are accepted directly
- `-g` / `--glob` makes ordinals behave as glob patterns instead of literal file
  paths
- `-i` / `--ignore` adds glob filters that exclude matching entry files

If no ordinals are supplied, the CLI scans these default entry-point patterns:

- `**/*.{test,spec}.ts`
- `test/**/*.ts`

The discovery logic uses `Bun.Glob`, normalizes output paths for display, and
deduplicates results before printing or handing them to `run`.

## AssemblyScript Compiler Wrapper

`as/compile.ts` is the current AssemblyScript integration point. It does not use
a shell. Instead, it calls the AssemblyScript CLI programmatically through
`assemblyscript/asc` and captures compiler output in memory.

### Compiler option model

The exported `CompilerOptions` type is a local harness-specific subset of the
AssemblyScript compiler surface. It intentionally does **not** expose every raw
CLI flag directly. Some flags are omitted because the harness wants to own them
centrally, and some are normalized to a simpler internal shape.

Examples of enforced rules already in place:

- optimize level is not exposed
- shrink level is not exposed
- converge is not exposed
- `outFile` is not exposed
- `textFile` is modeled as `boolean`
- bindings are modeled as a `boolean` that maps to raw bindings only
- source maps are modeled as `boolean`
- `debug` is forced on
- `exportStart` is forced
- `noColors` is forced on

### Forced compiler defaults

The wrapper currently always injects these AssemblyScript arguments:

- `--target debug`
- `--outFile output.wasm`
- `--debug`
- `--exportStart ""`
- `--noColors`

The debug target choice is aligned with AssemblyScript’s own `asinit` scaffold,
which uses `asc ... --target debug` for its debug build target.

### Config interaction

The compiler argument builder only emits optional flags when the corresponding
property is actually present on `CompilerOptions`. This matters because the
harness wants `asconfig.json` to remain authoritative when the caller has not
explicitly overridden a value.

In practice, that means:

- omitted compiler options are not serialized into the `asc` argv
- `asconfig` can still provide defaults for omitted values
- harness-enforced flags remain enforced regardless of `asconfig`

### File I/O hooks

The wrapper implements AssemblyScript’s programmatic `readFile`, `writeFile`,
and `listFiles` hooks:

- `readFile` first checks the bundled virtual `~/.as-harness` tree and then
  falls back to disk reads from the provided `baseDir`
- `listFiles` first checks the bundled virtual `~/.as-harness` tree and then
  falls back to directory reads while excluding `.d.ts`
- `writeFile` captures emitted outputs in memory instead of writing to disk

The virtual `~/.as-harness` tree is populated from a generated TypeScript
module, not from runtime filesystem scanning. That is what allows the standalone
CLI binary to ship the AssemblyScript support sources as bundled text.

Bundled transform modules are handled differently from AssemblyScript source
files. The generator also stores precompiled JS transform assets, and the
compiler wrapper writes those assets to a temporary directory when a compile
requests a bundled `--transform` path. This is necessary because AssemblyScript
expects transform modules to exist as real JS files on disk.

### Artifact model

Compiler output is returned as:

```ts
type Artifact = {
  path: string;
  contents: Uint8Array;
  contentType: string;
}
```

The wrapper currently infers content types from the emitted file extension.

## Runtime Abstraction

The `runtime/` folder introduces a harness-oriented runtime abstraction that is
separate from AssemblyScript’s own `runtime` compiler option.

The shared interface is:

```ts
interface Runtime {
  name: string;
  mutateCompilerArguments(compilerArguments: string[]): void;
}
```

The intended pattern is dependency injection:

- `as/compile.ts` builds the base compiler argv
- the selected harness runtime receives that argv
- the runtime mutates the argv in place
- the final argv is then passed into AssemblyScript

This design was chosen specifically so a runtime can override or remove existing
flags safely instead of only appending more arguments.

Current harnesses:

- `js`
- `wasmtime`
- `wazero`

All three exist as stubs today and currently leave the compiler argument list
unchanged.

## CLI Help Screens

The package currently exposes two help surfaces:

- top-level help via `help` or `--help`
- run-specific help via `run --help`

The run help screen is more detailed and includes:

- entry discovery behavior
- run-only flags
- the intended compiler flag surface
- the forced compiler defaults

## Native Module Placeholder

`n-api/` exists so the package has a stable location for native modules that
will eventually be bundled or distributed alongside the CLI. It currently only
contains a placeholder README, but the directory is part of the intended package
structure.

## Known Gaps

The package is not feature-complete. The most important remaining gaps are:

- `run` still needs to actually drive a compilation
- CLI-level parsing still needs to be connected to the compiler option model
- runtime harnesses still need real compiler-argument mutation logic
- coverage needs a real implementation and an actual supported format set
- the discovered entry files still need to be threaded into the compiler wrapper

For now, the package should be read as a solid scaffold for the CLI architecture
rather than a finished harness.
