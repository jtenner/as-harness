# Assembly Package

`assembly/` is the guest side of the project. It contains the AssemblyScript code that compiles into Wasm and runs inside a host harness.

The most important rule is:

- guest code declares, traverses, and emits facts
- host code instantiates, schedules, decodes, and reports

The guest/host boundary used by the shipped hosts is documented in [docs/harness-abi.md](../docs/harness-abi.md).

## What Lives Here

- `assembly/assembly/internal/`
  Guest runtime internals such as traversal, execution, events, hooks, and trampoline behavior.
- `assembly/assembly/exports.ts`
  The exported Wasm surface expected by hosts.
- `assembly/assembly/node_test/`
  The current test-declaration adapter.
- `assembly/assembly/node_assert/`
  The current assertion adapters.
- `assembly/assembly/test/`
  Guest-side fixtures and AssemblyScript smoke coverage.
- `roadmap.md`
  Adapter-level roadmap and deferred surface notes.

## Current Scope

Implemented today:

- guest-side event serialization and flat imported ABI calls
- node registration and `NodeIndex`-based discovery
- targeted `run()` by staged `NodeIndex`
- top-level and immediate-child `discover()` flows
- a synchronous `node:test` declaration and execution core
- `node:assert` and `node:assert/strict` bridge work
- trampoline-backed callback trap observation

Still open:

- long-term host-runner contract cleanup and ABI-stability follow-through
- the deferred scheduler-step entrypoint decision
- more framework adapters
- richer reflected diagnostics and strict-equality follow-through

## How Hosts Use It

Hosts compile or receive Wasm built from this package and then:

1. instantiate it with the required imports
2. call `__start` when present
3. stage `NodeIndex` values through `allocateNodeIndexBuffer(...)`
4. call `discover()` and `run()`
5. decode events emitted through `write_event(...)`

If you are implementing a harness, start with [docs/harness-abi.md](../docs/harness-abi.md) before reading the guest internals.

## Writing Tests

The current supported authoring path is Node-shaped synchronous AssemblyScript:

```ts
import { test } from "node:test";

test("works", (t) => {
	t.assert.strictEqual<i32>(1, 1);
});
```

That source is compiled into Wasm by the CLI, then executed by a harness.

## Commands

```bash
cd assembly
npm ci
npm test
```

For the broader repo flow:

```bash
bun test
```

## Related Docs

- Repo overview: [README.md](../README.md)
- Harness ABI: [docs/harness-abi.md](../docs/harness-abi.md)
- Guest runtime architecture: [docs/primary-buildout.md](../docs/primary-buildout.md)
- Guest roadmap: [assembly/roadmap.md](./roadmap.md)
