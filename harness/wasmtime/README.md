# harness/wasmtime

Rust/Node-API host implementation built on `wasmtime`.

## What lives here

- `src/lib.rs` — native addon entry and wrapper around Wasm execution
- `index.cjs` — JS `Harness` API and shared `start.cjs` orchestration
- `scripts/build.mjs` — local build helper with platform-specific linker setup
- `test/smoke.host.cjs` — shared smoke + CLI smoke fixture

## Scope

- source-host execution only (not packaged in release artifacts yet)
- same shared contract and callback suite as `js` and `wazero`
- supports coverage declaration/imports and merged snapshots

## Build and Test

```bash
cd harness/wasmtime
node ./scripts/build.mjs
npm test
```

## Notes

- native package source verification remains in CI source-host matrix.
- Linux/Windows/ARM cross-target packaging is not currently part of release artifacts.
