# Assembly Package

`assembly/` is the guest runtime side of as-harness.

Guest owns discovery, execution traversal, and fact emission.
Host owns scheduling, aggregation, and reporting.

## Layout

- `assembly/assembly/internal/`: runtime primitives (events, nodes, traversal, executor, hooks, assertions, imports/exports).
- `assembly/assembly/exports.ts`: Wasm exports expected by hosts.
- `assembly/assembly/as_harness/`: native scheduler-aware guest surface.
- `assembly/assembly/ava/`: thin sync AVA-shaped declaration surface.
- `assembly/assembly/node_test/`: native `node:test` surface.
- `assembly/assembly/jasmine/`: thin sync Jasmine-shaped surface.
- `assembly/assembly/jest/`: thin sync Jest-shaped surface.
- `assembly/assembly/mocha/`: thin sync Mocha BDD-shaped surface.
- `assembly/assembly/qunit/`: thin sync QUnit-shaped declaration and assertion surface.
- `assembly/assembly/tap/`: thin sync Tap-shaped declaration, hook, and assertion surface.
- `assembly/assembly/tape/`: thin sync Tape-shaped declaration and assertion surface.
- `assembly/assembly/uvu/`: sync `uvu`-shaped declarations, host-owned hint helpers, plus the shared `uvu/assert` surface.
- `assembly/assembly/vitest/`: thin sync Vitest-shaped surface.
- `assembly/assembly/node_assert/`: assertion adapters.
- `assembly/assembly/test/`: guest fixtures and bootstrap tests.
- `roadmap.md`: adapter intent and scope tracking.

## Scope

- native `as-harness` declarations, sequential groups, chainable handles, and
  host-owned `inBand(...)` / `bail(...)` / `continueOnFailure(...)` hints
- synchronous `node:test`, chainable declarations, core hooks, and the same
  host-owned planning hints
- thin `jest`, `mocha`, `jasmine`, `ava`, `tap`, `tape`, `qunit`, `uvu`, and `vitest` adapters,
  including the shipped Vitest scheduling subset
- shared `uvu/assert` surface for assertion reuse, including the adapter-local
  `Assertion` class, structured `throws(...)` parity for inner `uvu`
  assertion failures, structural `match(...)`, runtime-type `instance(...)`,
  and host-backed `snapshot(...)` / `fixture(...)` support
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
