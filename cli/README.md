# `@as-harness/cli`

`cli/` is the Bun-based command-line surface for the project. It discovers AssemblyScript test entry files, compiles them into Wasm, selects a harness, and runs the resulting module.

## What It Does Today

- `list` discovers candidate test entry files
- `run` compiles discovered entries and executes them
- `--harness js` and `--harness wazero` select the shipped harnesses
- the compiler wrapper bundles guest support files into the CLI build
- `build.ts` emits target-specific Bun executables
- the release workflows use the same build metadata and packaged smoke scripts as local development

## What It Does Not Do Yet

- user-facing coverage output
- external harness plugin resolution
- a stable public runtime-selection API beyond the current built-ins
- fully proven release history across the entire hosted runner matrix

## Runtime Model

The CLI works in two layers:

1. compile guest code into Wasm with the bundled guest support files
2. hand the Wasm bytes to a selected host runtime

The host runtime contract used by the CLI is the `Runtime` interface in [types.ts](/home/jtenner/Projects/as-harness/cli/runtime/types.ts). The lower-level host ABI itself is documented in [docs/harness-abi.md](/home/jtenner/Projects/as-harness/docs/harness-abi.md).

## Built-In Harnesses

- `js`
  Portable baseline host built on standard JavaScript WebAssembly APIs.
- `wazero`
  Native-addon host built on Go and `Node-API`.

The default is `js`.

## Compilation Flow

The CLI creates a temporary wrapper entrypoint that:

- re-exports `allocateNodeIndexBuffer`, `discover`, `invoke`, and `run`
- imports the discovered user test files for side effects

That wrapper is then compiled through the AssemblyScript wrapper in [compile.ts](/home/jtenner/Projects/as-harness/cli/as/compile.ts).

## Packaging

The packaged executable flow is:

1. generate bundled guest support files
2. stage a matching wazero addon when the target supports it
3. compile a target-specific Bun executable
4. smoke-test the packaged executable through `js`
5. smoke-test it through `wazero` when the target supports the addon

Shared release-target metadata lives in [build-targets.ts](/home/jtenner/Projects/as-harness/cli/build-targets.ts).

That metadata now also declares which packaged harnesses each release artifact is expected to support, and the release workflow uses the same source of truth to generate `release-manifest.json` plus release notes.

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
- release publish failures: verify the release tag matches [package.json](/home/jtenner/Projects/as-harness/cli/package.json) and that the asset directory contains every expected packaged executable

## Related Docs

- Repo overview: [README.md](/home/jtenner/Projects/as-harness/README.md)
- Harness ABI: [docs/harness-abi.md](/home/jtenner/Projects/as-harness/docs/harness-abi.md)
- Release process: [docs/release-process.md](/home/jtenner/Projects/as-harness/docs/release-process.md)
- Third-party notices: [THIRD_PARTY_NOTICES.md](/home/jtenner/Projects/as-harness/THIRD_PARTY_NOTICES.md)
- Native addon staging: [cli/n-api/README.md](/home/jtenner/Projects/as-harness/cli/n-api/README.md)
- Strict-equality transform: [cli/transform/README.md](/home/jtenner/Projects/as-harness/cli/transform/README.md)
