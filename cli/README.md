# `@as-harness/cli`

`cli/` is the Bun-based command-line surface for the project. It discovers AssemblyScript test entry files, compiles them into Wasm, selects a harness, and runs the resulting module.

## What It Does Today

- `list` discovers candidate test entry files
- `run` compiles discovered entries and executes them
- `--harness js`, `--harness wazero`, and `--harness wasmtime` select the available harnesses
- the compiler wrapper bundles guest support files into the CLI build
- `build.ts` emits target-specific Bun executables
- the release workflows use the same build metadata and packaged smoke scripts as local development
- CI also drives a separate source-host validation matrix so `wasmtime` can be proven without being added to packaged artifacts yet
- the source-host validation path now emits per-target JSON and Markdown reports for CI artifacts and summaries
- `run` now builds a deterministic result tree and feeds it through a reporter contract instead of formatting directly from live callbacks

## What It Does Not Do Yet

- user-facing coverage output
- external harness plugin resolution
- a stable public runtime-selection API beyond the current built-ins
- fully proven release history across the entire hosted runner matrix

## Runtime Model

The CLI works in two layers:

1. compile guest code into Wasm with the bundled guest support files
2. hand the Wasm bytes to a selected host runtime

The host runtime contract used by the CLI is the `Runtime` interface in [types.ts](./runtime/types.ts). The lower-level host ABI itself is documented in [docs/harness-abi.md](../docs/harness-abi.md).

The default reporter currently:

- prints passed / failed / discovered counts
- prints failure messages for failing executions
- prints `diagnostic` and `trace` logs only for failed executions

On the guest-library side, the CLI also bundles a thin Jest-shaped adapter
behind `--lib jest`. That adapter currently covers test/suite declarations,
core hooks, and a small `expect(...)` surface backed by the shared assertion
machinery, including `toThrow()`.

For the exact guest-facing Jest surface, see [docs/Jest.md](../docs/Jest.md).

## Built-In Harnesses

- `js`
  Portable baseline host built on standard JavaScript WebAssembly APIs.
- `wazero`
  Native-addon host built on Go and `Node-API`.
- `wasmtime`
  Native-addon host built on Rust, `wasmtime`, and `Node-API`. This path is available for source execution and CI smoke coverage, but is not bundled into the packaged release artifacts.

The default is `js`.

Packaged availability is target-specific. At the moment:

- macOS packaged builds support `js` and `wazero`
- Linux x64 packaged builds support `js` and `wazero`
- Linux arm64 packaged builds support `js` only
- Windows packaged builds support `js` only

## Compilation Flow

The CLI creates a temporary wrapper entrypoint that:

- re-exports `allocateNodeIndexBuffer`, `discover`, `invoke`, and `run`
- imports the discovered user test files for side effects

That wrapper is then compiled through the AssemblyScript wrapper in [compile.ts](./as/compile.ts).

## Packaging

The packaged executable flow is:

1. generate bundled guest support files
2. stage a matching wazero addon when the target supports it
3. compile a target-specific Bun executable
4. smoke-test the packaged executable through `js`
5. smoke-test it through `wazero` when the target supports the addon

Shared release-target metadata lives in [build-targets.ts](./build-targets.ts).

That metadata now also declares which packaged harnesses each release artifact is expected to support, and the release workflow uses the same source of truth to generate `release-manifest.json` plus release notes.

The same module also defines the source-host validation matrix consumed by CI.

The release metadata path now also emits `SHA256SUMS.txt` and validates that the Git tag matches the CLI package version before publish.

The publish path now also stages `THIRD_PARTY_NOTICES.md` and the tracked third-party license texts into the release asset set.

## Commands

```bash
cd cli
bun install
bun run dev -- help
bun run dev -- list
bun run dev -- run ./example.test.ts
bun run build:list-targets
bun run build:list-release-targets
bun run build
bun run build:release
```

## Troubleshooting

Common CLI failure classes:

- entry discovery failures: check glob usage and ignored paths
- compile failures: inspect AssemblyScript diagnostics and custom `--lib` or `--transform` options
- harness resolution failures: verify the `--harness` value and packaged runtime availability
- packaged `wazero` failures: verify the staged addon target matches the Bun executable target
- release publish failures: verify the release tag matches [package.json](./package.json) and that the asset directory contains every expected packaged executable

## Related Docs

- Repo overview: [README.md](../README.md)
- Harness ABI: [docs/harness-abi.md](../docs/harness-abi.md)
- Release process: [docs/release-process.md](../docs/release-process.md)
- Third-party notices: [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)
- Native addon staging: [cli/n-api/README.md](./n-api/README.md)
- Strict-equality transform: [cli/transform/README.md](./transform/README.md)
