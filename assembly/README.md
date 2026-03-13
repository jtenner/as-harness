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
- internal event serialization helpers in `assembly/assembly/internal/events.ts`
- serializer-shape tests in `assembly/assembly/test/internal/events.ts`
- a dedicated `assembly/assembly/exports.ts` Wasm export entrypoint for future CLI-driven test module compilation
- framework adapter folder skeletons for planned `--lib` entry points
- a root-driven Bun test workflow that compiles and instantiates the AssemblyScript test entrypoint

Not implemented yet:

- framework adapter source code
- declaration registration/runtime traversal
- hook execution
- assertion bridge beyond the initial event work
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

`assembly/assembly/exports.ts`
: Wasm-export-oriented entrypoint reserved for test modules that need explicit Wasm exports. It is intentionally empty today because the current root test workflow uses `assembly/assembly/test/index.ts` instead.

`assembly/assembly/test/`
: Internal AssemblyScript test entrypoint and test modules.

Current files:

- `index.ts`: barrel entrypoint for internal tests
- `internal/events.ts`: tests for serializer output shape

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

These folders currently contain TODO stubs only. The intent is that each adapter will expose framework-shaped globals and lower them into shared internal primitives.

`assembly/build/`
: Generated build artifacts such as `.wasm`, `.js`, `.d.ts`, `.wat`, and source maps.

## Architecture

The design is documented in [primary-buildout.md](/home/jtenner/Projects/as-harness/docs/primary-buildout.md).

The important boundary is:

- Wasm side: declaration lowering, traversal mechanics, callback execution, hook execution, event emission, and minimal ABI surface
- Host side: decoding, canonical graph state, scheduling, failure interpretation, aggregation, and reporting

The AssemblyScript package is being organized around these internal module boundaries:

- `api`
- `registry`
- `traversal`
- `executor`
- `hooks`
- `assert_bridge`
- `events`
- `abi`
- `state`

Only the earliest `events` and import-boundary pieces exist right now.

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

The serializer tests currently execute as top-level AssemblyScript assertions inside `assembly/assembly/test/internal/events.ts`.

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
- use `assembly/assembly/exports.ts` when a test module needs explicit Wasm exports for future CLI-driven execution; keep it empty unless that CLI path needs a dedicated entrypoint
- use `assembly/assembly/test/` for internal AssemblyScript tests
- use the root `bun run test` workflow to compile and execute those tests
- treat the framework adapter folders as planned `--lib` entry points, not as general-purpose source folders
