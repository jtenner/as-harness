# `harness/wazero`

`harness/wazero` is the `wazero host`: a Go-based host runtime exposed to JavaScript as a `Node-API addon`. This is a native addon path, not a pure `JS host` path.

## Current Status

Implemented today:

- A Go addon that exports `createHarness(bytes)` to JavaScript
- Wasm compilation through wazero
- Guest `discover()` and `run()` integration
- Event decoding and callback delivery back to JavaScript
- `start()` scheduling inside the native addon
- A build script that emits `dist/wazero.node`
- Smoke tests that build and load the addon

Still planned:

- Cross-platform release automation for every shipping target
- Hardening beyond the current early host/runtime surface

## Artifact Shape

The output of this package is a real `.node` binary:

- `dist/wazero.node`

That file is a `Node-API addon`, so it is a `target-specific native artifact`.

## Packaging Implications

- The `wazero host` must be built per platform and architecture.
- Linux libc variants may matter, so `glibc` and `musl` can require separate artifacts.
- The intended MVP includes this path, so any target that ships the `wazero host` must package or extract the matching `.node` addon alongside the `single-file Bun executable`.
- The current repo proves local addon builds and smoke tests and now includes GitHub workflow definitions for packaged CLI release targets, but it does not yet have a proven cross-target release history.

## Node-API In This Repo

`Node-API` is the stable C ABI used for native addons in Node-compatible runtimes. In this repo, it is the layer that lets Go code compile into a `.node` addon that JavaScript can load from Node or Bun. The ABI is stable, but the resulting addon binary is still platform-specific.

## Why Use The wazero Host

This path is more complex than the `JS host`, but it is still part of the intended MVP because wazero-specific execution semantics are a product goal. The tradeoff is packaging and CI complexity: every shipping target needs a matching native build.

## Build Notes

- `scripts/build.mjs` locates Node headers and runs `go build -buildmode=c-shared`.
- On Windows, the build can reuse a local `node.lib` or download the matching import library into `.cache/`.
- `NODE_API_INCLUDE_DIR`, `NODE_API_LIB_FILE`, and `npm_config_nodedir` can be used to point the build at a specific Node installation.

## Commands

```bash
cd harness/wazero
npm run build
npm test
```
