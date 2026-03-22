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

- Linux glibc is in scope for `v0.1.0`; musl is not.
- bundled Linux CLI builds force the `wazero` interpreter engine for stability.
- source Linux arm64 and Windows builds can be produced locally.
- packaged release matrix currently falls back to `js` on known problem targets while collecting verification.

## Related Docs

- [cli/n-api/README.md](../../cli/n-api/README.md)
- [docs/003-2026-03-17-harness-abi.md](../../docs/003-2026-03-17-harness-abi.md)
- [docs/007-2026-03-17-host-runner-contract.md](../../docs/007-2026-03-17-host-runner-contract.md)
