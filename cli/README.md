# `@as-harness/cli`

`cli/` is the Bun-based CLI package and intended distribution surface for the project. Today it provides the executable entrypoint, entry discovery, a real default-`js` compile-and-run path, the AssemblyScript compiler wrapper, bundled support-file handling, and multi-target Bun compilation. The broader shipped runner surface is still in progress.

## Current Status

Implemented today:

- A Bun CLI entrypoint at `index.ts`
- `help`, `list`, and a real `run` command for the default `js` host
- Entry discovery with default globs, explicit file paths, glob mode, and ignore filters
- A programmatic AssemblyScript compiler wrapper in `as/compile.ts`
- Bundled virtual AssemblyScript support files generated from `../assembly/assembly/**/*.ts`
- A first end-to-end `run` flow that compiles discovered entries, instantiates them through `harness/js`, and prints basic pass/fail summaries
- A first explicit harness selector for `run` through `--harness js|wazero`
- Parsing and forwarding for the documented `run` compiler flags into the AssemblyScript wrapper
- A multi-target Bun build script that emits one `single-file Bun executable` per Bun target

Planned or incomplete:

- Coverage flags are placeholders
- The runtime abstraction now supports the default `js` host flow, but runtime selection is not yet a stable user-facing feature
- The runtime selector currently only covers `--harness js|wazero`; unsupported harness names fail fast and the packaged `wazero` path is still incomplete
- `cli/n-api/` is still packaging scaffolding rather than a finished embedded native path

## What The CLI Currently Does

- Lists candidate AssemblyScript test entry files.
- Compiles discovered AssemblyScript test entries together with the bundled harness exports.
- Executes compiled test modules through the default `js` host.
- Supports explicit `--harness js` and `--harness wazero` selection, with a clear failure for unsupported harness names.
- Forwards the documented compile-time `run` flags into the AssemblyScript compiler wrapper.
- Prints basic pass/fail summaries and failing test messages.
- Wraps `assemblyscript/asc` programmatically instead of shelling out.
- Captures compiler outputs in memory.
- Builds target-specific Bun executables under `dist/<target>/`.

The CLI now proves the first compile-and-run flow through the default `js` host and exposes an explicit `--harness` override, but it does not yet provide the final dual-host packaging story.

## Bundled Support Files

The CLI already bundles guest-side support code used during AssemblyScript compilation.

- `as/generate-virtual-files.ts` scans `../assembly/assembly/**/*.ts` and emits `as/virtual-files.generated.ts`.
- `as/compile.ts` exposes those files through a virtual `~/.as-harness` tree when AssemblyScript asks for library files.
- Bundled transform assets are written to a temporary directory when AssemblyScript needs a real JS transform path on disk.
- When `node:assert` or `node:assert/strict` is requested through `--lib`, the compiler wrapper also enables the bundled strict-equality transform.

This matters for packaging because a compiled Bun executable cannot rely on the source repo layout being present at runtime.

## Runtime Selection

There is an internal runtime abstraction in `runtime/` with `js`, `wazero`, and `wasmtime` entries. The default `js` path now drives the real `run` command, while `wazero` and broader runtime-selection behavior still need CLI wiring and packaging work. The intended MVP is still to ship both the `JS host` and the `wazero host`, but the CLI does not yet offer a stable runtime selector, and it does not yet prove the packaged `wazero host` `Node-API addon` path.

## Packaging Notes

- Bun can compile this CLI into a target-specific `single-file Bun executable`.
- `build.ts` regenerates bundled AssemblyScript support files before each executable build.
- The current build matrix includes macOS, Linux, Linux `musl`, and Windows Bun targets, even though the first release direction does not promise Linux `musl` support.
- The intended MVP is to support both runtime paths from the CLI:
  - the `JS host` as the portable baseline
  - the `wazero host` as the native companion path where a matching addon exists
- If the CLI later loads a `.node` `Node-API addon`, that addon becomes a `target-specific native artifact` and must match the executable target platform and architecture.
- For Linux native addons, libc variants may matter too.

The `JS host` path is still the lower-risk packaging baseline because it avoids native addon distribution entirely, but the docs now treat the `wazero host` as part of the intended MVP rather than a post-MVP idea.

## Key Files

- `index.ts`
  CLI entrypoint and command parsing.
- `build.ts`
  Bun executable build matrix.
- `as/compile.ts`
  Programmatic AssemblyScript compiler wrapper.
- `as/generate-virtual-files.ts`
  Bundled support-file generator.
- `transform/`
  Bundled transform support for the current strict-equality work.
- `runtime/`
  Runtime-selection scaffolding.
- `n-api/`
  Placeholder area for future CLI-side native packaging work.

## Commands

```bash
bun install
bun run dev
bun run clean
bun run build:list-targets
bun run build
```

Examples:

```bash
bun run dev -- list
bun run dev -- list test/example.spec.ts
bun run dev -- list --glob "test/**/*.ts" --ignore "fixtures/**"
bun run dev -- run --help
```
