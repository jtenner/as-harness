# Assembly Package

`assembly/` is the guest side of the project. It contains the AssemblyScript code that compiles into Wasm and runs inside a host harness.

The most important rule is:

- guest code declares, traverses, and emits facts
- host code instantiates, schedules, decodes, and reports

The guest/host boundary used by the shipped hosts is documented in
[docs/003-2026-03-17-harness-abi.md](../docs/003-2026-03-17-harness-abi.md), and the JavaScript-facing
runner surface above that boundary is documented in
[docs/007-2026-03-17-host-runner-contract.md](../docs/007-2026-03-17-host-runner-contract.md). The current
source-host set exercising that contract is `harness/js`, `harness/wazero`,
and `harness/wasmtime`.

## What Lives Here

- `assembly/assembly/internal/`
  Guest runtime internals such as traversal, execution, events, hooks, and trampoline behavior.
- `assembly/assembly/exports.ts`
  The exported Wasm surface expected by hosts.
- `assembly/assembly/node_test/`
  The current test-declaration adapter.
- `assembly/assembly/jest/`
  A thin Jest-shaped declaration adapter built on the same runtime primitives.
  See [docs/005-2026-03-17-jest-adapter.md](../docs/005-2026-03-17-jest-adapter.md) for the current guest-facing surface.
- `assembly/assembly/vitest/`
  A thin Vitest-shaped declaration adapter built on the same runtime
  primitives. See [docs/008-2026-03-19-vitest-adapter.md](../docs/008-2026-03-19-vitest-adapter.md) for the current
  guest-facing surface.
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
- chainable `node:test` declaration handles for explicit dependency edges
- a thin synchronous `jest` adapter for `test` / `it` / `describe`, core hooks, and a small `expect(...)` surface including containment, length/size, numeric checks, `NaN`, and `toThrow()`
- a thin synchronous `vitest` adapter for `test` / `it` / `describe` / `suite`, low-risk `sequential` aliases, core hooks, `fails`, `skipIf` / `runIf`, `assertType(...)`, and the same small `expect(...)` surface reused from `jest`
- `node:assert` and `node:assert/strict` bridge work
- trampoline-backed callback trap observation
- bundled guest-side coverage declarations used by the CLI `--coverage` flow

Still open:

- more framework adapters
- richer reflected diagnostics and strict-equality follow-through

Explicitly deferred:

- scheduler-step entrypoints beyond the current flat ABI

## How Hosts Use It

Hosts compile or receive Wasm built from this package and then:

1. instantiate it with the required imports
2. call `__start` when present
3. stage `NodeIndex` values through `allocateNodeIndexBuffer(...)`
4. call `discover()` and `run()`
5. decode events emitted through `write_event(...)`

If you are implementing a harness, start with [docs/003-2026-03-17-harness-abi.md](../docs/003-2026-03-17-harness-abi.md) before reading the guest internals.

## Writing Tests

The current supported authoring path is Node-shaped synchronous AssemblyScript:

```ts
import { test } from "node:test";

test("works", (t) => {
	t.assert.strictEqual<i32>(1, 1);
});

const first = test("runs first", (_t) => {});
test("runs after first", (_t) => {}).dependsOn(first);
```

Current dependency policy for that surface:

- prerequisites must remain runnable in the discovered test graph
- `skip`, `todo`, or `only`-filtered prerequisites block their dependents
- `expectFailure` prerequisites satisfy dependents only when they fail
  as expected
- an `expectFailure` prerequisite that passes unexpectedly is treated as a
  failing prerequisite and can block its dependents

That source is compiled into Wasm by the CLI, then executed by a harness.

A thin Jest-shaped declaration path also exists through the bundled `"jest"`
guest library:

```ts
import { describe, expect, test } from "jest";

describe("suite", () => {
	test("works", () => {
		expect<i32>(1 + 1).toBe(2);
	});
});
```

That adapter currently covers the declaration shape, core hooks, and a small
shared-assertion-backed matcher set including equality, containment,
length/size checks, numeric comparisons, `NaN`, and `toThrow()`. It does not
try to provide broad matcher parity, mocks, spies, or async Jest helpers.

The exact supported API, alias mapping, skip-pruning behavior, and current
`toThrow()` callback contract are described in [docs/005-2026-03-17-jest-adapter.md](../docs/005-2026-03-17-jest-adapter.md).

A thin Vitest-shaped declaration path also exists through the bundled
`"vitest"` guest library:

```ts
import { describe, expect, test } from "vitest";

describe("suite", () => {
	test("works", () => {
		expect<i32>(1 + 1).toBe(2);
	});
});
```

That adapter currently covers test/suite declarations, low-risk
`sequential` aliases, `fails`, `skipIf` / `runIf`, core hooks, `assertType(...)`, and the same shared
assertion-backed matcher set currently shipped for `jest`. It does not try to
provide fixtures, `vi`, snapshots, async helpers, or broad upstream Vitest
parity.

The exact supported API and deferred surface are described in
[docs/008-2026-03-19-vitest-adapter.md](../docs/008-2026-03-19-vitest-adapter.md).

The current source-host validation matrix exercises the same guest runtime
through JavaScript, Go/wazero, and Rust/Wasmtime hosts.

## Commands

```bash
cd assembly
npm ci
npm run asbuild
```

For the broader repo flow:

```bash
bun test
```

## Related Docs

- Repo overview: [README.md](../README.md)
- Harness ABI: [docs/003-2026-03-17-harness-abi.md](../docs/003-2026-03-17-harness-abi.md)
- Host runner contract: [docs/007-2026-03-17-host-runner-contract.md](../docs/007-2026-03-17-host-runner-contract.md)
- Guest runtime contracts: [docs/006-2026-03-17-guest-runtime-contracts.md](../docs/006-2026-03-17-guest-runtime-contracts.md)
- Guest runtime architecture: [docs/001-2026-03-13-primary-buildout.md](../docs/001-2026-03-13-primary-buildout.md)
- Guest roadmap: [assembly/roadmap.md](./roadmap.md)
