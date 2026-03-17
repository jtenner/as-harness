# `harness/wazero`

`harness/wazero` is the Go-based native host implementation. It exposes the shared harness contract through a `Node-API` addon.

## Why It Exists

This host proves that the harness ABI is not tied to one implementation language. The guest protocol is the same as `harness/js`; only the runtime strategy differs.

## Artifact

The package builds:

- `dist/wazero.node`

That file is a target-specific `Node-API` addon.

## Responsibilities

This host:

- validates and compiles Wasm through wazero
- decodes the same event protocol as `harness/js`
- implements `callI32`, `discover`, `run`, and `start`
- keeps branch discovery and execution scheduling inside the native addon

## Build Requirements

- Go toolchain
- Node headers
- on Windows, a usable `node.lib` import library

The build script supports:

- `NODE_API_INCLUDE_DIR`
- `NODE_API_LIB_FILE`
- `npm_config_nodedir`

On Windows, the build script can also download a matching `node.lib` into `.cache/` when one is not already available.

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

The repo now has workflow definitions for this path, but the full cross-target release story still needs repeated green runs and end-user validation.

## Testing

This package shares the main host-parity smoke suite with `harness/js`.

Package-local extra coverage still exists for:

- running the CLI through `--harness wazero`

## Related Docs

- Repo overview: [README.md](/home/jtenner/Projects/as-harness/README.md)
- Harness ABI: [docs/harness-abi.md](/home/jtenner/Projects/as-harness/docs/harness-abi.md)
- CLI native addon staging: [cli/n-api/README.md](/home/jtenner/Projects/as-harness/cli/n-api/README.md)
