# Harness ABI

This document describes the contract a host harness must satisfy to run AssemblyScript modules produced by this repo. It is written for implementers who want to provide their own harness instead of reusing `harness/js`, `harness/wazero`, or `harness/wasmtime`.

There are two layers:

- the guest Wasm ABI between the compiled AssemblyScript module and the host runtime
- the host-facing harness API exposed to JavaScript and consumed by the CLI

## Audience

Use this document if you are:

- implementing a new host in another language
- validating that an existing host matches the shipped contract
- integrating the guest runtime without copying the current JS or Go hosts

## Stability

The project intends this ABI to stay flat and language-agnostic. It is still early and not yet versioned independently, so treat it as the current contract for `v0.2.0` work rather than a permanent frozen standard.

For coverage-enabled runs, the current CLI-level report contract is `text`,
`json`, `yaml`, `csv`, `lcov`, and `cobertura`.

## Guest Wasm ABI

### Required Imports

The guest module imports from module name `as-harness`:

- `write_event(kind: u32, payloadPtr: usize, payloadLen: u32): void`
- `invoke_staged(): i32`

The guest may also rely on the normal AssemblyScript abort import from module `env`:

- `abort(messagePtr, fileNamePtr, line, column)`
- `trace(messagePtr, valueCount, a0, a1, a2, a3, a4)`

When compiled with coverage enabled, the guest also imports from module
`__asCovers`:

- `coverDeclare(filePtr, id, line, column, coverType)`
- `cover(id)`

### Required Exports

The host must expect these guest exports:

- `memory`
- `allocateNodeIndexBuffer(length: u32): usize`
- `discover(): i32`
- `run(): i32`
- `invoke(): void`
- `__start` when present

### Export Semantics

`allocateNodeIndexBuffer(length)`:

- allocates guest memory for a `NodeIndex`
- returns a pointer to the first `u32`
- the host writes `length` little-endian `u32` values into that buffer

`discover()`:

- with no staged `NodeIndex`, emits top-level `NodeFound` events and returns the count of discovered root children
- with a staged `NodeIndex`, discovers immediate children under that node
- returns a negative value on discovery failure

`run()`:

- consumes the staged `NodeIndex`
- returns `1` when the targeted node completed without trapping
- returns `0` when the target does not exist, no `NodeIndex` was staged, or execution failed
- for `todo` nodes, a direct targeted run is a structural no-op: the node is considered resolved, but it should not emit normal execution events or count as a meaningful self outcome

`invoke()`:

- trampoline export used by the host-managed callback trap boundary
- should be called only through the `invoke_staged()` import contract

`__start`:

- should be called by the host after instantiation when present
- initializes guest module state and top-level declarations

## Enumerations

These values are part of the wire contract today.

### `NodeKind`

- `0`: root
- `1`: test
- `2`: describe

### `DeclarationMode`

- `1`: normal
- `2`: skip
- `3`: todo

### `HookKind`

- `1`: beforeAll
- `2`: beforeEach
- `3`: afterEach
- `4`: afterAll

### `EventKind`

- `1`: `NodeFound`
- `2`: `NodeStart`
- `3`: `NodePass`
- `4`: `FailMessage`
- `5`: `CallbackStart`
- `6`: `CallbackPass`
- `7`: `Diagnostic`
- `8`: `NodeFail`
- `9`: `CallbackFail`
- `10`: `Log`

### `FailureKind`

- `1`: assertion-driven failure
- `2`: trap or unreachable condition observed through the trampoline boundary

### `CoverPointType`

- `1`: function
- `2`: block
- `3`: expression

## Event Payload Layouts

All integer fields are little-endian.

### Shared `NodeIndex` Encoding

`NodeIndex` is encoded as:

```text
[length: u32] [element_0: u32] ... [element_n: u32]
```

### `NodeFound`

```text
[node_index_length: u32]
[node_index: ...u32 bytes]
[kind: u8]
[declaration_mode: u8]
[padding: 2 bytes]
[name_byte_length: u32]
[name: utf8 bytes]
```

### `NodeStart`

```text
[node_index_length: u32]
[node_index: ...u32 bytes]
```

### `NodePass`

```text
[node_index_length: u32]
[node_index: ...u32 bytes]
```

### `FailMessage`

```text
[message: utf8 bytes]
```

### `NodeFail`

```text
[failure_kind: u8]
[padding: 3 bytes]
[node_index_length: u32]
[node_index: ...u32 bytes]
```

### `CallbackStart`

```text
[hook: u8]
[padding: 3 bytes]
[node_index_length: u32]
[node_index: ...u32 bytes]
```

### `CallbackPass`

```text
[hook: u8]
[padding: 3 bytes]
[node_index_length: u32]
[node_index: ...u32 bytes]
```

### `CallbackFail`

```text
[hook: u8]
[failure_kind: u8]
[padding: 2 bytes]
[node_index_length: u32]
[node_index: ...u32 bytes]
```

### `Diagnostic`

```text
[node_index_length: u32]
[node_index: ...u32 bytes]
[message_byte_length: u32]
[message: utf8 bytes]
```

### `Log`

This is the host-side payload used when intercepting AssemblyScript `trace(...)`
calls.

```text
[value_count: u32]
[value_0: f64] ... [value_n: f64]
[message_byte_length: u32]
[message: utf8 bytes]
```

## Host Responsibilities

A harness implementation is responsible for:

- validating input Wasm bytes
- compiling and instantiating the guest module
- calling `__start` when present
- decoding events emitted through `write_event(...)`
- staging `NodeIndex` values through `allocateNodeIndexBuffer(...)`
- implementing trap observation around `invoke()`
- decoding coverage declarations and hit events when the guest imports `__asCovers`
- exposing a host API that matches the `Harness` interface
- providing a `start()` orchestration path that discovers and executes branches

The host is also the durable source of truth for reporting and scheduling policy. The guest emits execution facts; the host decides how to aggregate them.

Structured failure events are intentionally low-level:

- `nodeFail` means the targeted node did not complete successfully
- `callbackFail` means a lifecycle callback failed before node completion
- `failureKind` distinguishes assertion-driven failures from traps
- the guest does not classify user-facing outcome text beyond emitted `FailMessage` facts
- `Log` is the host-facing form of guest `trace(...)` calls

`DeclarationMode` affects host scheduling:

- `normal` nodes may be scheduled for execution
- `skip` nodes remain discoverable but their children should be pruned
- `todo` nodes remain discoverable, their descendants may still be discovered, but the host should suppress the `todo` node's own execution significance

## Public Host Surface

The current host interface lives in [harness-types.d.ts](../harness/shared/harness-types.d.ts).

At a high level, a harness must expose:

- `onNodeFound(callback)`
- `onNodeStart(callback)`
- `onNodePass(callback)`
- `onNodeFail(callback)`
- `onFailMessage(callback)`
- `onCallbackStart(callback)`
- `onCallbackPass(callback)`
- `onCallbackFail(callback)`
- `onDiagnostic(callback)`
- `onLog(callback)`
- `callI32(exportName)`
- `discover(nodeIndex)`
- `run(nodeIndex)`
- `start()`
- `getCoverageSnapshot()`
- `resetCoverage()`
- `close()`

### Event Callbacks

Each callback receives a decoded event object, not raw bytes. The event shapes are the typed form of the payloads above.

### `callI32(exportName)`

This is a narrow probe API:

- input: name of a zero-argument guest export
- output: unsigned `i32` result
- failure: throw when the export name is invalid, missing, traps, or returns the wrong shape

It is useful for host-level probes such as trampoline status checks.

### `discover(nodeIndex)`

- input: `Array<number>`
- returns `true` on successful discovery
- returns `false` on invalid input, missing node, or discovery failure
- should emit `nodeFound` callbacks for discovered children

### `run(nodeIndex)`

- input: `Array<number>`
- returns `true` when the node completed successfully
- returns `false` on invalid input, missing node, or failed execution
- should emit the normal event stream for that execution attempt
- should emit `nodeFail` for node-level assertion mismatches, traps, and end-of-scope plan failures
- should emit `callbackFail` when a lifecycle callback fails before node completion
- should surface guest `trace(...)` calls through `log` events
- for `todo` targets, success means the node was resolved without trapping, but the host should expect no normal execution events for the `todo` node itself

### `start()`

`start()` is the host-owned orchestration API used by the CLI today. It should:

- discover top-level nodes
- discover branch-local child nodes
- identify runnable tests
- execute each branch
- return a `HarnessStartResult`

When coverage instrumentation is enabled, the returned `HarnessStartResult`
also carries merged coverage data for the full run. When coverage is not
enabled for a run, that field is `null`. When coverage is enabled but the
current filters produce no instrumented points, hosts should still return an
empty snapshot rather than collapsing back to `null`.

The current CLI reporter model consumes the final `HarnessStartResult` tree
rather than streaming output directly from callbacks. Hosts should therefore
preserve deterministic branch / execution results even when live callbacks are
also supported.

The current result shape is documented in [harness-types.d.ts](../harness/shared/harness-types.d.ts).

### `close()`

- releases any host-owned runtime resources associated with the harness
- should be idempotent
- should make it safe for the embedding process to exit without waiting on guest-runtime cleanup
- callers should prefer explicit `close()` over relying on GC or finalizers

## Minimal Implementation Checklist

For a new harness, the minimum useful implementation order is:

1. load bytes and compile the guest module
2. implement `write_event(...)` decoding
3. implement `allocateNodeIndexBuffer(...)` staging
4. implement `discover(nodeIndex)`
5. implement `run(nodeIndex)`
6. implement `callI32(exportName)`
7. implement `invoke_staged()` plus trap observation
8. implement `start()`

## Validation Strategy

Before treating a new harness as compatible, verify:

- decoded event payloads match the shared host parity expectations
- `callI32`, `discover`, and `run` match the current `js`, `wazero`, and `wasmtime` semantics
- trampoline trap observation matches the shipped hosts
- the harness can drive a CLI-style wrapper entrypoint that re-exports `allocateNodeIndexBuffer`, `discover`, `invoke`, and `run`

The current reference implementations are:

- [harness/js/index.cjs](../harness/js/index.cjs)
- [harness/wazero/index.cjs](../harness/wazero/index.cjs)
- [harness/wasmtime/index.cjs](../harness/wasmtime/index.cjs)
- [smoke-suite.cjs](../harness/shared/smoke-suite.cjs)

## Non-Goals

This ABI document does not define:

- CLI flag parsing
- user-facing reporting text
- framework adapter semantics beyond the current guest exports and events
- a plugin registry for third-party harnesses
- long-term version negotiation

Those are product-layer concerns above the transport described here.
