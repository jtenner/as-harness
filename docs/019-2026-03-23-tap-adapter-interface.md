# `tap` Adapter Interface

This note answers which `tap` functions, types, and per-test methods should be
implemented next for `as-harness`, recommends an honest synchronous subset, and
defines the slice plan for `assembly/assembly/tap/`, bundled CLI wiring, and
proof coverage.

## Question

What `tap` API surface should `as-harness` implement next, and how should that
surface be reduced into an honest adapter that matches the current shared
runtime?

## Recommendation

Ship `tap` as a thin synchronous adapter centered on:

- a default-exported root object for declaration and hook registration only
- matching named exports for root declarations and hooks
- an adapter-local `Test` callback object with nested subtests, hook
  registration, lifecycle helpers, reflection fields, and a focused assertion
  subset
- explicit documentation that `tap` root-level assertion helpers, timeout /
  bailout controls, Promise-returning helpers, child-process helpers, mocking,
  fixtures, snapshots, and options-object overloads remain deferred

This is the closest honest fit to the current runtime. Upstream `tap` exports a
singleton root `t` that mixes declaration, lifecycle, assertion, and
process/plugin features into one object. The shared `as-harness` runtime can
model the declaration and per-test callback parts directly, but it cannot
honestly execute module-scope root assertions or TAP-stream control features
without inventing new host or guest semantics.

## Affected Repo Areas

- `assembly/assembly/tap/`
- `assembly/assembly/lib/tap.ts`
- `assembly/assembly/test/internal/tap.ts`
- `assembly/assembly/test/tap-smoke.ts`
- `cli/as/compile.ts`
- `cli/run.test.ts`
- `assembly/roadmap.md`
- `agent-todo.md`

## Upstream Surface Summary

The published package `tap@21.6.2` exports:

- a default `t` singleton
- a `Test` type
- named declaration and lifecycle helpers such as `test`, `skip`, `todo`,
  `only`, `before`, `after`, `beforeEach`, `afterEach`, `plan`, `end`,
  `comment`, and `pragma`
- many assertion helpers such as `ok`, `notOk`, `same`, `notSame`,
  `strictSame`, `strictNotSame`, `throws`, `doesNotThrow`, `type`, `error`, and
  more
- many plugin-driven helpers such as mocking, snapshots, fixtures, worker
  threads, subprocesses, stdin parsing, and event assertions

The upstream `Test` class also exposes:

- subtest methods: `test`, `skip`, `todo`, `only`
- lifecycle methods: `before`, `after`, `beforeEach`, `afterEach`, `teardown`,
  `plan`, `end`, `setTimeout`, `bailout`
- reflection: `name`, `fullname`, `count`, `passed`, `results`, and more
- an assertion-heavy callback surface

## Honest Shipped Subset

### Root object and named exports

Ship these at module scope:

- `default` export `tap`
- `test(name, cb)`
- `skip(name, cb)`
- `todo(name, cb)`
- `only(name, cb)`
- `before(fn)`
- `after(fn)`
- `beforeEach(fn)`
- `afterEach(fn)`

These all lower cleanly onto the existing declaration and hook graph.

### Callback `Test` object

Ship an adapter-local `Test` callback object with:

- subtest methods:
  - `test(name, cb)`
  - `skip(name, cb)`
  - `todo(name, cb)`
  - `only(name, cb)`
- lifecycle helpers:
  - `plan(count, comment?)`
  - `end()`
  - `comment(message)`
  - `teardown(fn)` as the documented alias of `after`
  - `before(fn)`
  - `after(fn)`
  - `beforeEach(fn)`
  - `afterEach(fn)`
- reflection:
  - `name`
  - `fullname`
  - `count`
  - `passed`
  - `attempt`
- assertion subset:
  - `pass`
  - `fail`
  - `ok`
  - `notOk`
  - `equal`
  - `not`
  - `same`
  - `notSame`
  - `strictSame`
  - `strictNotSame`
  - `throws`
  - `doesNotThrow`
  - `type`
  - `error`

### Intentional divergences

These should be documented as adapter-local differences, not hidden:

- the default root export is declaration-and-hook-only, not the full upstream
  assertion object
- named exports only cover the shipped declaration / hook subset
- per-test helpers accept the simple `(name, cb)` shape; the package-wide
  `extra` / options-object overload families stay deferred
- `plan(count, comment?)` accepts the optional comment parameter for API shape,
  but the comment is not emitted as a separate TAP plan row in `as-harness`
- `teardown(fn)` lowers to the shared after-all hook model
- `count` reports observed assertion count in the active execution context

## Deferred Surface

The following upstream features should stay explicitly out of scope for this
adapter cycle:

- root-level assertion helpers such as top-level `ok`, `same`, `throws`,
  `comment`, `plan`, and `end`
- `pragma(...)`
- `bailout(...)`
- `timeout(...)` / `setTimeout(...)`
- Promise-returning or event-driven helpers such as `emits(...)`
- matcher families requiring richer pattern semantics such as `has*`,
  `match*`, and `resolve*`
- plugin-driven helpers:
  - snapshots
  - fixtures / `testdir`
  - mocks / intercept / capture
  - stdin / spawn / worker subtests
- options-object overloads and broader config plumbing

## Why This Subset Fits The Current Runtime

- `tap` subtests are structurally close to the shipped `tape` adapter, so the
  declaration and nested-callback shape can lower cleanly to the shared node
  graph.
- `before`, `after`, `beforeEach`, and `afterEach` already map onto the shared
  hook model used by `node:test`, `mocha`, `jasmine`, and `ava`.
- the selected assertion methods already have equivalents in the shared
  assertion bridge or the `node:assert` shared helpers.
- root-level TAP stream controls and plugin-driven helpers would require new
  host or guest protocols, so shipping them now would overstate compatibility.

## Implementation Slices

### `tap-001`: interface note and live backlog plan

Goals:

- add this `tap` interface note
- replace the placeholder `tap/TODO.md`
- expand `agent-todo.md` with concrete remaining slices and runtime-fit risks
- link the roadmap to this note

Files:

- `docs/019-2026-03-23-tap-adapter-interface.md`
- `assembly/assembly/tap/TODO.md`
- `assembly/roadmap.md`
- `agent-todo.md`
- `CHANGELOG.md`

### `tap-002`: declaration and hook shell

Goals:

- add `assembly/assembly/tap/index.ts`, `types.ts`, and `parse.ts`
- ship the root `tap` object plus named root declarations and hooks
- ship callback-level `test`, `skip`, `todo`, `only`, `before`, `after`,
  `beforeEach`, `afterEach`, and `teardown`
- expose reflection fields that do not require assertion lowering yet
- add internal proof for nested subtests and hook registration

Files:

- `assembly/assembly/tap/index.ts`
- `assembly/assembly/tap/types.ts`
- `assembly/assembly/tap/parse.ts`
- `assembly/assembly/test/internal/tap.ts`
- `assembly/assembly/test/index.ts`

### `tap-003`: lifecycle and assertion slice

Goals:

- add `plan(count, comment?)`, `end()`, `comment(...)`, and `count`
- add the shipped assertion subset
- add one `tap` smoke fixture that proves root declarations, nested subtests,
  root hooks, nested hooks, assertion counting, and teardown behavior across
  the shared host matrix

Files:

- `assembly/assembly/tap/types.ts`
- `assembly/assembly/test/internal/tap.ts`
- `assembly/assembly/test/tap-smoke.ts`
- `harness/shared/smoke-suite.cjs`
- `assembly/assembly/tap/TODO.md`
- `agent-todo.md`
- `CHANGELOG.md`

### `tap-004`: bundled CLI surface and shipped docs

Goals:

- add bundled lib entry `assembly/assembly/lib/tap.ts`
- wire `tap` through CLI compile rewriting
- regenerate the bundled virtual AssemblyScript files
- add one direct bundled CLI proof
- mark `tap` as shipped in READMEs, roadmap, and backlog docs

Files:

- `assembly/assembly/lib/tap.ts`
- `cli/as/compile.ts`
- `cli/as/compile.test.ts`
- `cli/as/virtual-files.generated.ts`
- `cli/run.test.ts`
- `README.md`
- `assembly/README.md`
- `cli/README.md`
- `assembly/roadmap.md`
- `assembly/assembly/tap/TODO.md`
- `agent-todo.md`
- `CHANGELOG.md`

## Exit Criteria

The adapter is complete for this cycle when:

1. root `tap` declarations and hooks are discoverable
2. callback `Test` objects can declare nested subtests and hooks
3. the shipped lifecycle and assertion subset executes across `js`, `wazero`,
   and `wasmtime`
4. bundled CLI compile rewriting recognizes `tap`
5. a direct bundled CLI test proves the shipped `tap` subset
6. docs and backlog files list `tap` as shipped and keep deferred behavior
   explicit

## Sources

- `tap@21.6.2` published package metadata and `dist/esm/main.d.ts`, inspected
  locally with `npm view tap ...` and `npm pack tap`
- [tap package README](https://www.npmjs.com/package/tap)
- [Test class API docs](https://tapjs.github.io/tapjs/classes/_tapjs_test.index.Test.html)
- [asserts module API docs](https://tapjs.github.io/tapjs/modules/_tapjs_asserts.html)
