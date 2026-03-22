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

- Linux glibc is in scope for the current packaged release matrix; musl is not.
- bundled Linux CLI builds still force the `wazero` interpreter engine for the
  current packaged stability policy while the hosted compiler-engine hang
  remains under investigation.
- source CLI runs under Bun on Windows stage a private copy of `wazero.node`
  before loading the addon.
- source-host CLI smoke proof builds a Node-targeted CLI bundle and runs that
  bundle under Node `25.8.1` instead of invoking `bun run ./cli/index.ts`
  directly.
- source Linux arm64 and Windows builds can be produced locally.
- packaged release coverage currently ships on `bun-darwin-arm64`,
  `bun-darwin-x64`, and `bun-linux-x64`; `bun-linux-arm64` and
  `bun-windows-x64` remain `js`-only.
- source and bundled `wazero` CLI loading intentionally diverge today:
  source mode keeps the repo-local source-host path working across the Node 25
  matrix, while packaged mode keeps the bundled extracted-addon path working
  inside the compiled executable.

## Related Docs

- [cli/n-api/README.md](../../cli/n-api/README.md)
- [docs/003-2026-03-17-harness-abi.md](../../docs/003-2026-03-17-harness-abi.md)
- [docs/007-2026-03-17-host-runner-contract.md](../../docs/007-2026-03-17-host-runner-contract.md)
