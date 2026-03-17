# `harness/wazero`

`harness/wazero` is the Go-based native host implementation. It exposes the shared harness contract through a `Node-API` addon.

## Why It Exists

This host proves that the harness ABI is not tied to one implementation language. The guest protocol is the same as `harness/js` and `harness/wasmtime`; only the runtime strategy differs.

## Artifact

The package builds:

- `dist/wazero.node`

That file is a target-specific `Node-API` addon.

## Responsibilities

This host:

- validates and compiles Wasm through wazero
- decodes the same event protocol as `harness/js`
- intercepts AssemblyScript `trace(...)` calls and surfaces them as `log` events
- implements `callI32`, `discover`, `run`, and `start`
- keeps branch discovery and execution scheduling inside the native addon
- implements the conditional `__asCovers` imports and returns merged coverage snapshots when the guest is instrumented
- now requires explicit `close()` to release the native runtime promptly instead of waiting for GC finalization

## Build Requirements

- Go toolchain
- Node headers
- on Windows, a usable `node.lib` import library

The build script supports:

- `NODE_API_INCLUDE_DIR`
- `NODE_API_LIB_FILE`
- `npm_config_nodedir`

On Windows, the build script can also download a matching `node.lib` into `.cache/` when one is not already available, and it stages the import library under `.cache/` before passing `-L... -l:node.lib` into cgo so hosted builds do not depend on raw absolute library paths.

## Install And Packaging Story

For local development:

```bash
cd harness/wazero
npm run build
npm test
```

For packaged CLI builds:

- the addon must be built once per supported target
- the packaged Bun executable must stage the matching `.node` file
- Linux `glibc` is in scope for `v0.1.0`; `musl` is not

Current packaged-platform note:

- source-based Windows addon builds are supported
- source-based Linux arm64 addon builds are supported
- packaged Windows CLI artifacts currently fall back to `js` instead of bundling
  `wazero`, because Bun's standalone Windows executable is still crashing while
  loading the native `.node` addon
- packaged Linux arm64 CLI artifacts currently fall back to `js` because the
  hosted packaged `wazero` smoke is still timing out on Bun's standalone
  executable path

The hosted release matrix now builds and verifies the packaged targets in CI. The remaining release proof is clean-environment download-and-run validation for end users on each shipped platform.

## Testing

This package shares the main host-parity smoke suite with `harness/js` and `harness/wasmtime`.

Package-local extra coverage still exists for:

- running the CLI through `--harness wazero`

## Related Docs

- Repo overview: [README.md](../../README.md)
- Harness ABI: [docs/harness-abi.md](../../docs/harness-abi.md)
- CLI native addon staging: [cli/n-api/README.md](../../cli/n-api/README.md)
