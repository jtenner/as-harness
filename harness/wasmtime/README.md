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
- supports coverage declaration/imports, merged coverage snapshots, and
  host-owned `uvu/assert` fixture / snapshot artifacts

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
- Linux/Windows/ARM cross-target packaging is not currently part of release artifacts.
