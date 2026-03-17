# `harness/wasmtime`

`harness/wasmtime` is a Rust-backed native host implementation built on
`wasmtime`. It exposes the shared harness contract through a `Node-API` addon
and shares the same smoke-suite expectations as `harness/js` and
`harness/wazero`.

## What Lives Here

- `src/lib.rs`
  The Rust `Node-API` addon implementation that instantiates guest Wasm through
  `wasmtime`, stages node indexes, invokes the guest exports, and returns raw
  harness events back to the JS wrapper.
- `index.cjs`
  The JS wrapper that decodes raw events, exposes the shared harness methods,
  and adds the shared `start()` orchestration through `harness/shared/start.cjs`.
- `scripts/build.mjs`
  The local cargo build helper that compiles the Rust addon and stages
  `dist/wasmtime.node`.
- `test/smoke.host.cjs`
  The shared host-behavior smoke suite plus a CLI smoke that runs
  `as-harness run --harness wasmtime`.

## Build and Test

Requirements:

- Rust toolchain with `cargo`
- Node.js 22
- Bun
- AssemblyScript package dependencies installed

Package-local commands:

```bash
cd harness/wasmtime
node ./scripts/build.mjs
npm test
```

## Scope

Current status:

- source-based host runtime works through a Rust `Node-API` addon
- the package exposes the same public host surface as the other shipped hosts
- the shared smoke suite covers event decoding, `callI32`, `discover`, `run`,
  `start`, traps, and replay behavior
- AssemblyScript `trace(...)` calls surface through the shared `log` event
- CLI source execution supports `--harness wasmtime`
- the CI source-host matrix runs this package on the supported hosted runners
- the shared source-host verification script emits per-target proof reports that include the `wasmtime` result

Not in scope yet:

- packaged Bun release artifacts bundling the Wasmtime addon
- target-specific release-matrix or packaged-smoke coverage for `wasmtime`

## Related Docs

- Repo overview: [README.md](../../README.md)
- Harness ABI: [docs/harness-abi.md](../../docs/harness-abi.md)
- CLI docs: [cli/README.md](../../cli/README.md)
