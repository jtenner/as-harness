# `@as-harness/cli`

`cli/` is the Bun-based CLI package and intended distribution surface for the project. Today it proves the executable entrypoint, entry discovery, AssemblyScript compiler wrapper, bundled support-file handling, and multi-target Bun compilation. The finished end-to-end compile-and-run product is still in progress.

## Current Status

Implemented today:

- A Bun CLI entrypoint at `index.ts`
- `help`, `list`, and a scaffolded `run` command
- Entry discovery with default globs, explicit file paths, glob mode, and ignore filters
- A programmatic AssemblyScript compiler wrapper in `as/compile.ts`
- Bundled virtual AssemblyScript support files generated from `../assembly/assembly/**/*.ts`
- A multi-target Bun build script that emits one `single-file Bun executable` per Bun target

Planned or incomplete:

- `run` still exits as a scaffold instead of driving the full compile-and-run flow
- Coverage flags are placeholders
- The runtime abstraction exists, but runtime-specific compiler mutations are still stubs
- A user-facing runtime selector is not wired up yet
- `cli/n-api/` is still packaging scaffolding rather than a finished embedded native path

## What The CLI Currently Does

- Lists candidate AssemblyScript test entry files.
- Documents the intended `run` surface and forced compiler defaults.
- Wraps `assemblyscript/asc` programmatically instead of shelling out.
- Captures compiler outputs in memory.
- Builds target-specific Bun executables under `dist/<target>/`.

The CLI does not yet prove the final product flow of compiling user tests and executing them through a selected host runtime.

## Bundled Support Files

The CLI already bundles guest-side support code used during AssemblyScript compilation.

- `as/generate-virtual-files.ts` scans `../assembly/assembly/**/*.ts` and emits `as/virtual-files.generated.ts`.
- `as/compile.ts` exposes those files through a virtual `~/.as-harness` tree when AssemblyScript asks for library files.
- Bundled transform assets are written to a temporary directory when AssemblyScript needs a real JS transform path on disk.
- When `node:assert` or `node:assert/strict` is requested through `--lib`, the compiler wrapper also enables the bundled strict-equality transform.

This matters for packaging because a compiled Bun executable cannot rely on the source repo layout being present at runtime.

## Runtime Selection

There is an internal runtime abstraction in `runtime/` with `js`, `wazero`, and `wasmtime` entries, but those implementations are currently stubs that only satisfy a shared interface. The intended MVP is to ship both the `JS host` and the `wazero host`, but the CLI does not yet offer a stable runtime-selection feature, and it does not yet load the `wazero host` `Node-API addon`.

## Packaging Notes

- Bun can compile this CLI into a target-specific `single-file Bun executable`.
- `build.ts` regenerates bundled AssemblyScript support files before each executable build.
- The current build matrix includes macOS, Linux, Linux `musl`, and Windows Bun targets.
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
