# `harness/js`

`harness/js` is the pure `JS host` package. It runs the harness on top of the standard JavaScript WebAssembly APIs with no native addon layer.

## Current Status

Implemented today:

- `createHarness(bytes)` validates and compiles Wasm in-process
- `discover(nodeIndex)` and `run(nodeIndex)` call the guest exports directly
- `start()` performs discovery and execution scheduling using worker threads
- Host callbacks receive decoded events emitted through the guest `write_event` ABI
- The package has smoke tests against compiled AssemblyScript fixtures

This is a real host package, but it is still an early host/runtime surface rather than the finished end-user product.

## Why This Is The Pure JS Path

- There is no `Node-API addon`.
- There is no `.node` file to ship.
- There is no per-platform native build step inside this package.

That makes it the simplest and most portable host strategy in the repo today.

## Why This Path Matters

For release strategy, the `JS host` is one half of the intended MVP:

- It avoids `target-specific native artifact` management.
- It keeps packaging aligned with Bun's own executable targets.
- It provides the portable baseline even when the `wazero host` addon is not available for a given target.

The repo does not yet prove the full packaged Bun flow, but this remains the lowest-risk baseline inside a dual-path MVP that also includes the `wazero host`.

## Current Limits

- This package is tested as a standalone host package, not yet as the finished compiled CLI runtime.
- It follows the same early harness contract as the `wazero host`, so host policy and reporting are still evolving.
- It does not provide wazero-specific behavior; it is the JavaScript-hosted execution path.

## Files

- `index.cjs`: `JS host` implementation
- `index.d.ts`: host API types
- `test/smoke.host.cjs`: host smoke tests

## Commands

```bash
cd harness/js
npm test
```
