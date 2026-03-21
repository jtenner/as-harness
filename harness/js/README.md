# harness/js

Portable JavaScript host for the shared runtime contract.

## Purpose

- no native addon
- no per-platform binary artifact
- easiest starting point for ABI validation and implementation reference

## Surface

`createHarness(bytes)` returns a shared `Harness` instance with:

- `discover` / `run` stage/replay by `NodeIndex`
- `start()` orchestration through shared deterministic planning plus same-machine worker slots
- event callbacks and report-tree aggregation
- coverage collection merge/snapshot reset
- optional `close()`

## Responsibilities

- validate and instantiate Wasm
- decode `write_event(...)` payloads
- trap observation via trampoline boundary
- `trace(...)` interception → `log` events
- emit merged coverage snapshots when guest declares coverage

## Testing and Notes

- shared host smoke suites are shared with `wazero` and `wasmtime`.
- package-local extra checks focus on JS-specific `start()` scheduling and report-shape behavior.

```bash
cd harness/js
npm test
```

## Related Docs

- [harness/shared/harness-types.d.ts](../shared/harness-types.d.ts)
- [docs/003-2026-03-17-harness-abi.md](../../docs/003-2026-03-17-harness-abi.md)
- [docs/007-2026-03-17-host-runner-contract.md](../../docs/007-2026-03-17-host-runner-contract.md)
- [harness/shared/smoke-suite.cjs](../shared/smoke-suite.cjs)
