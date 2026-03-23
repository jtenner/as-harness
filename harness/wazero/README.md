# harness/wazero

Go host implementation via Node-API addon.

## Purpose

Proves the ABI is not tied to one runtime language by implementing the same shared contract with a native addon.

## Artifact

- `dist/wazero.node` (target-specific native addon)

## Responsibilities

- compile and instantiate Wasm via wazero
- mirror JS host wire decoding and callback registration
- expose `callI32`, `discover`, `run`
- run shared `start()` through `harness/shared/start.cjs` with same-machine worker slots for ready work
- provide persistent coverage snapshots (`getCoverageSnapshot` / `resetCoverage`)
- decode and surface structured `debug` events for rewritten `abort(...)` / `trace(...)` payloads
- provide host-owned fixture reads plus snapshot compare/update support for
  bundled `uvu/assert`
- explicit `close()` to release native resources promptly

## Build Requirements

- Go `1.26.1` or newer toolchain
- Node headers
- Windows `node.lib` (auto-download path supported)

## Build / Install

```bash
cd harness/wazero
npm run build
npm test
```

## Packaging Notes

- published as `@as-harness/wazero` plus per-platform optional binary packages
- Linux glibc is in scope for the current public npm lane; musl is not.
- source worker execution under Bun on Windows stages a private copy of `wazero.node`
  before loading the addon.
- source-host CLI smoke proof builds a Node-targeted CLI bundle and runs that
  bundle under Node `25.8.1` instead of invoking `bun run ./cli/index.ts`
  directly.
- source Linux arm64 and Windows builds can be produced locally.
- source-host verification and npm package install-smoke are now the maintained
  proof paths.

## Related Docs

- [docs/003-2026-03-17-harness-abi.md](../../docs/003-2026-03-17-harness-abi.md)
- [docs/007-2026-03-17-host-runner-contract.md](../../docs/007-2026-03-17-host-runner-contract.md)
- [docs/022-2026-03-23-abort-trace-debug-payload-contract.md](../../docs/022-2026-03-23-abort-trace-debug-payload-contract.md)
