# `harness/js`

`harness/js` is the pure JavaScript host implementation. It is the portable baseline harness for the repo.

## Why It Exists

- no native addon
- no per-platform build artifact
- easiest host to understand when implementing the ABI in another language

If you want to understand the contract before reading the native addons, start here and pair it with [docs/harness-abi.md](../../docs/harness-abi.md).

## Surface

The package exports:

- `createHarness(bytes)`

The returned harness implements the shared host API from [harness-types.d.ts](../shared/harness-types.d.ts).

## Responsibilities

This host:

- validates Wasm bytes
- compiles and instantiates the guest module
- decodes event payloads emitted through `write_event(...)`
- stages `NodeIndex` values for `discover()` and `run()`
- observes traps through the trampoline boundary
- provides `start()` scheduling through worker threads
- supports explicit `close()` calls for interface parity, though it does not hold native resources

## Testing

The package now shares the main host-behavior smoke suite with `harness/wazero` and `harness/wasmtime`, which means parity regressions show up in all shipped hosts at once.

Package-local extra coverage still exists for:

- JS-specific worker-thread `start()` behavior

## Commands

```bash
cd harness/js
npm test
```

## Related Docs

- Repo overview: [README.md](../../README.md)
- Harness ABI: [docs/harness-abi.md](../../docs/harness-abi.md)
- Shared smoke parity suite: [smoke-suite.cjs](../shared/smoke-suite.cjs)
