# harness/wasmtime

Rust/Node-API host implementation built on `wasmtime`.

## What lives here

- `src/lib.rs` — native addon entry and wrapper around Wasm execution
- `index.cjs` — JS `Harness` API and shared `start.cjs` orchestration
- `scripts/build.mjs` — local build helper with platform-specific linker setup
- `test/smoke.host.cjs` — shared smoke + CLI smoke fixture

## Scope

- published as `@as-harness/wasmtime` plus per-platform binary packages
- same shared contract and callback suite as `js` and `wazero`
- supports coverage declaration/imports, merged coverage snapshots, and
  host-owned `uvu/assert` fixture / snapshot artifacts
- decodes and surfaces structured `debug` payload events for rewritten
  `abort(...)` / `trace(...)` output through the shared host callback contract

## Build and Test

Build requirement: Rust `1.94.0` stable or newer.

```bash
cd harness/wasmtime
node ./scripts/build.mjs
npm test
```

## Notes

- native package source verification remains in CI source-host matrix.
- source-host CLI smoke proof builds a Node-targeted CLI bundle and runs that
  bundle under Node `25.8.1` instead of invoking `bun run ./cli/index.ts`
  directly.
- the bundled source CLI uses `AS_HARNESS_SOURCE_CLI_REPO_DIR` during CI smoke
  so the Node-targeted bundle can still resolve the repo-local host package.
- public npm publication ships the per-platform binary packages that the
  `@as-harness/wasmtime` meta package resolves through `optionalDependencies`.
- the tracked source-build dependency inventory lives in
  [licenses/wasmtime/THIRD_PARTY_INVENTORY.md](../../licenses/wasmtime/THIRD_PARTY_INVENTORY.md)
  and is generated from `cargo metadata --format-version 1 --locked`.
