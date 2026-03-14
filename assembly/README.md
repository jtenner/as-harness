# Assembly Package

This package is the AssemblyScript side of the harness.

It is responsible for the Wasm-resident runtime that will eventually:

- define the internal test/runtime primitives
- expose framework-specific `--lib` entry points
- register test nodes and hooks
- replay and traverse the test tree
- emit normalized binary events to the host

The host side is intentionally separate. The Wasm module emits execution facts; the host owns orchestration, failure interpretation, aggregation, and reporting.

## Current Status

This package is still in early buildout.

Implemented today:

- a shared internal ABI import for `write_event`
- a shared host-managed trampoline ABI import for `invoke_staged() -> i32`
- internal event serialization helpers in `assembly/assembly/internal/events.ts`
- an internal `Node` class with lazy child discovery in `assembly/assembly/internal/node.ts`
- an internal staged-callback trampoline in `assembly/assembly/internal/trampoline.ts`
- an internal assertion bridge in `assembly/assembly/internal/assert-bridge.ts`
- serializer-shape tests in `assembly/assembly/test/internal/events.ts`
- `Node` metadata/discovery tests in `assembly/assembly/test/internal/node.ts`
- `node:assert` and `node:assert/strict` bridge entry points for `ok(...)`,
  callable/default `assert(...)`, `fail(...)`, `ifError(...)`,
  legacy `equal(...)` / `notEqual(...)`, `strictEqual(...)`,
  `notStrictEqual(...)`, `deepStrictEqual(...)`, `notDeepStrictEqual(...)`,
  `throws(...)`, and `doesNotThrow(...)`, plus strict-mode aliases for
  `equal(...)`, `notEqual(...)`, `deepEqual(...)`, and `notDeepEqual(...)`,
  plus `node:assert.strict` as a namespace alias for the strict entry point
- a dedicated `assembly/assembly/exports.ts` Wasm export entrypoint with a
  host-callable `allocateNodeIndexBuffer(length)` export for NodeIndex writes
  plus the guest-side `invoke()` trampoline export
- framework adapter folder skeletons for planned `--lib` entry points
- a root-driven Bun test workflow that compiles and instantiates the AssemblyScript test entrypoint

Not implemented yet:

- most framework adapter source code
- declaration registration/runtime traversal
- hook execution
- assertion failure default messaging beyond optional explicit message text
- function mocking, spies, and call-tracking assertions such as
  `toBeCalled(...)` or `toHaveBeenCalledTimes(...)`; these stay unsupported
  until AssemblyScript has usable closure support
- Promise-dependent assertion helpers such as `rejects(...)`,
  `doesNotReject(...)`, `.resolves`, `.rejects`, or async polling helpers stay
  unsupported until AssemblyScript has usable Promise support
- host-facing ABI exports for traversal/discovery

## Package Layout

`assembly/asconfig.json`
: AssemblyScript compiler configuration. The root test workflow currently overrides the target details directly from the root script when compiling the internal test entrypoint.

`assembly/package.json`
: Package metadata and local AssemblyScript dependency.

`assembly/roadmap.md`
: Planned framework and assertion-library support.

`assembly/assembly/internal/`
: Shared Wasm-side runtime internals.

Current files:

- `imports.ts`: imported ABI declarations and shared enums
- `events.ts`: event payload serialization and event-sender helpers
- `node.ts`: structural node metadata, the global `rootNode` / `currentNode`,
  and lazy child discovery
- `assert-bridge.ts`: shared failure-to-`FailMessage` helpers plus the first
  strict-structural assertion wrapper
- `reflected-value.ts`: the first reflected-diagnostics value model and
  collector-backed construction helpers
- `trampoline.ts`: the staged `() => void` trap-observation boundary used for
  host-mediated `toThrow()`-style assertions without Wasm exceptions

`assembly/assembly/exports.ts`
: Wasm-export-oriented entrypoint for test modules that need explicit Wasm exports. It currently exposes `allocateNodeIndexBuffer(length)` so host runtimes can allocate guest memory for a `StaticArray<u32>` NodeIndex before future traversal calls exist, and it re-exports the guest-side `invoke()` trampoline entrypoint used by the host-managed trap boundary.

`assembly/assembly/test/`
: Internal AssemblyScript test entrypoint and test modules.

Current files:

- `index.ts`: barrel entrypoint for internal tests
- `node-assert-smoke.ts`: exported smoke fixture for host-observed
  `node:assert` bridge success and failure behavior across direct and
  trampoline-backed assertions
- `node-assert-strict-smoke.ts`: exported smoke fixture for host-observed
  `node:assert/strict` bridge success and failure behavior across direct and
  trampoline-backed assertions
- `internal/events.ts`: tests for serializer output shape
- `internal/assert-bridge.ts`: tests for the non-trapping assertion bridge
  helpers
- `internal/reflected-value.ts`: tests for the reflected-value runtime model
  and collector helpers
- `trampoline-smoke.ts`: a host-runtime smoke fixture that probes the staged
  callback trampoline with both normal-return and `unreachable` paths

`assembly/assembly/<framework>/`
: Planned AssemblyScript `--lib` entry points for framework adapters.

Current skeleton folders include:

- `node:test`
- `node:assert`
- `jest`
- `mocha`
- `vitest`
- `ava`
- `tap`
- `tape`
- `uvu`
- `jasmine`
- `qnit`

These folders currently contain TODO stubs or the earliest assertion entrypoint
files. The intent is that each adapter will expose framework-shaped globals and
lower them into shared internal primitives.

`assembly/build/`
: Generated build artifacts such as `.wasm`, `.js`, `.d.ts`, `.wat`, and source maps.

## Architecture

The design is documented in [primary-buildout.md](/home/jtenner/Projects/as-harness/docs/primary-buildout.md).

The important boundary is:

- Wasm side: declaration lowering, traversal mechanics, callback execution, hook execution, event emission, and minimal ABI surface
- Host side: decoding, canonical graph state, scheduling, failure interpretation, aggregation, and reporting

For trap observation specifically, the current design is intentionally narrow:

- the guest stages exactly one `() => void` callback in
  `assembly/assembly/internal/trampoline.ts`
- the guest exports `invoke()`, which loads that staged callback and calls it
- the host import `invoke_staged()` calls back into guest `invoke()` and
  returns `0` when the inner call trapped or `1` when it returned normally
- the guest-side helper `didCallbackTrap(callback)` interprets `0` as logical
  "threw" for future `expect(fn).toThrow()` assertions

This is a host-mediated trap boundary, not guest-side exception handling, and
it assumes only one staged callback is active at a time.

The AssemblyScript package is being organized around these internal module boundaries:

- `api`
- `registry`
- `traversal`
- `executor`
- `hooks`
- `strict_equality`
- `assert_bridge`
- `events`
- `abi`
- `state`

Only the earliest `events`, node metadata, import-boundary pieces, and the
first strict-equality runtime helpers exist right now. That strict-equality
work currently covers the shared contract constants plus primitive, string,
nullable, runtime-type-id, pair-cache, active-stack, `NaN`-aware comparison
helpers, `ArrayBuffer` bytewise comparison, ordered `Array<T>` /
`StaticArray<T>` comparison, bytewise typed-array / `ArrayBufferView` /
`DataView` comparison, dedicated generated-member helpers for `ArrayBuffer`,
view-typed fields, `Set`, and `Map`, direct `Set` / `Map` comparison helpers,
function-reference identity comparison, managed-class recursion through
generated hooks, and the first reflected-value runtime slice for primitive,
string, `ArrayBuffer`, ordered array / `StaticArray`, and typed-array /
`ArrayBufferView`, `Set`, and `Map` diagnostics plus the generated key/value
collector. Recursive class reflected-value construction is now done through the
shared class-hook contract. Unmanaged references are
intentionally conservative by default: only safe shared paths such as identity,
nullability, and existing arraylike comparison should be relied on
automatically. Rich unmanaged deep-equality and reflected diagnostics now come
from explicit consumer-defined `__asHarnessStrictEquals(...)` and
`__asHarnessAddReflectedValueKeyValuePairs()` hooks instead of a runtime
fallback.

## Event Model

The current implementation work is centered on serialized event payloads.

Event kinds currently modeled:

- `NodeFound`
- `NodeStart`
- `NodePass`
- `FailMessage`
- `CallbackStart`
- `CallbackPass`

The current `NodeIndex` representation is `StaticArray<u32>`.

Serialization currently lives in `assembly/assembly/internal/events.ts` and writes directly into `StaticArray<u8>` buffers using AssemblyScript memory primitives.

The current structural node model lives in `assembly/assembly/internal/node.ts`.
It stores `kind`, `name`, `declarationMode`, parent linkage, and the callback
used to lazily rediscover children through `getChildren()`. It also exposes a
global `rootNode`, a mutable `currentNode`, and parent-bound child creation via
`currentNode.createChild(...)` or `node.createChild(...)`.

## Testing

The recommended test path is the root Bun script:

```sh
bun run test
```

That script:

1. compiles `assembly/assembly/test/index.ts`
2. generates ESM bindings and a debug Wasm output in `assembly/build/test-debug.*`
3. imports the generated ESM bootstrap so Bun instantiates the Wasm module
4. runs the AssemblyScript test module as part of module startup

Relevant files:

- `scripts/test.ts`
- `scripts/test-bootstrap.ts`

The internal tests currently execute as top-level AssemblyScript assertions inside:

- `assembly/assembly/test/internal/events.ts`
- `assembly/assembly/test/internal/node.ts`

## Build Notes

The root test script compiles the test entrypoint with explicit CLI flags instead of relying on the `debug` target from `assembly/asconfig.json`.

Current test compile flags are equivalent to:

```sh
npx asc assembly/test/index.ts --bindings esm --debug --sourceMap --exportStart __start --outFile build/test-debug.wasm
```

`--exportStart __start` is important here because it ensures the generated ESM wrapper initializes memory before calling the start function, which makes assertion failures report correctly through the generated `abort` path.

## Adapter Plan

The long-term plan is to support framework-shaped AssemblyScript library entry points for:

- `node:test`
- `jest`
- `mocha`
- `vitest`
- `ava`
- `tap`
- `tape`
- `uvu`
- `jasmine`
- `qnit`
- `node:assert`

The structure goal is:

- framework-specific naming and overloads stay inside each adapter folder
- shared semantics and binary event emission stay in the internal runtime
- adapters remain thin and deterministic

## Practical Summary

If you are working in this package now:

- use `assembly/assembly/internal/` for shared runtime primitives
- use `assembly/assembly/exports.ts` when a test module needs explicit Wasm exports for future CLI-driven execution; keep exports narrow and host-oriented
- use `assembly/assembly/test/` for internal AssemblyScript tests
- use the root `bun run test` workflow to compile and execute those tests
- treat the framework adapter folders as planned `--lib` entry points, not as general-purpose source folders
