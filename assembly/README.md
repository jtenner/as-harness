# Assembly Package

`assembly/` is the guest runtime side of as-harness.

Guest owns discovery, execution traversal, and fact emission.
Host owns scheduling, aggregation, and reporting.

## Layout

- `assembly/assembly/internal/`: runtime primitives (events, nodes, traversal, executor, hooks, assertions, imports/exports).
- `assembly/assembly/exports.ts`: Wasm exports expected by hosts.
- `assembly/assembly/node_test/`: native `node:test` surface.
- `assembly/assembly/jest/`: thin sync Jest-shaped surface.
- `assembly/assembly/vitest/`: thin sync Vitest-shaped surface.
- `assembly/assembly/node_assert/`: assertion adapters.
- `assembly/assembly/test/`: guest fixtures and bootstrap tests.
- `roadmap.md`: adapter intent and scope tracking.

## Scope

- synchronous `node:test`, chainable declarations, core hooks
- thin `jest` + `vitest` adapters
- `node:assert` / `node:assert/strict` bridge + trampoline trap observation
- shared event ABI, `NodeIndex` discovery/run model, and coverage declarations

## Still out of scope

- scheduler-step guest entrypoints
- async helpers, mock/spy APIs, broad assertion parity

## How hosts use it

1. compile Wasm
2. call `__start` when present
3. stage `NodeIndex` buffers
4. call `discover()` / `run()`
5. decode emitted events

See [docs/003-2026-03-17-harness-abi.md](../docs/003-2026-03-17-harness-abi.md) before extending the ABI.
