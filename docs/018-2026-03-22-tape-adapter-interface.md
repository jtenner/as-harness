# `tape` Adapter Interface

This note answers which `tape` functions and per-test methods should be
implemented for `as-harness`, recommends the honest synchronous AssemblyScript
surface to ship first, and defines the slice plan for
`assembly/assembly/tape/`, bundled CLI wiring, and proof coverage.

Repository policy note as of 2026-03-23: public installation is npm-only, annotated tags create notes-only GitHub release pages, and `@as-harness/cli` expects a consumer-installed `assemblyscript` peer.

## Question

What `tape` API surface should `as-harness` implement next, and how should that
surface be sliced so each commit lands an honest, testable improvement instead
of a partial compatibility veneer?

## Recommendation

Ship `tape` as a thin synchronous adapter centered on:

- `test(name, callback)` plus `test.only(...)` and `test.skip(...)`
- an adapter-local per-test `TestContext`
- nested subtests via `t.test(name, callback)`
- synchronous planning and teardown helpers that the shared runtime can
  represent honestly
- a useful assertion subset built on the existing assertion bridge and
  `node:assert` helpers

Do not promise yet:

- promise-returning or callback-driven async completion
- `test([name], [opts], cb)` overload parity via an options object
- global lifecycle hooks such as `test.onFinish(...)` and `test.onFailure(...)`
- reporter / stream APIs such as `createHarness()` or `createStream()`
- timeout control, capture / intercept helpers, regex-match helpers, or
  deep-loose structural comparison

Affected repo area:

- `assembly/assembly/tape/`
- `assembly/assembly/lib/tape.ts`
- `cli/as/*`
- `cli/run.test.ts`
- shared smoke / internal proof fixtures under `assembly/assembly/test/` and
  `harness/shared/`

## Primary Sources

- [tape readme](https://raw.githubusercontent.com/tape-testing/tape/master/readme.markdown)
- [tape repository](https://github.com/tape-testing/tape)

## Upstream Surface Summary

The current upstream `tape` surface is still centered on a default exported
`test(...)` function and a mutable per-test assertion object.

Core entrypoints visible in upstream docs:

- `test([name], [opts], cb)`
- `test.skip([name], [opts], cb)`
- `test.only([name], [opts], cb)`
- `test.onFinish(fn)`
- `test.onFailure(fn)`
- `test.createHarness()`
- `test.createStream(opts)`

Core per-test methods visible in upstream docs:

- `t.plan(n)`
- `t.end(err)`
- `t.teardown(cb)`
- `t.test([name], [opts], cb)`
- `t.comment(message)`
- `t.pass(msg)`
- `t.fail(msg)`
- `t.skip(msg)`
- `t.ok(value, msg)` with aliases such as `t.true()` and `t.assert()`
- `t.notOk(value, msg)` with aliases such as `t.false()` and `t.notok()`
- `t.error(err, msg)` with aliases such as `t.ifError()`
- strict equality helpers such as `t.equal(...)`, `t.strictEqual(...)`, and
  strict inequality aliases
- loose equality helpers such as `t.looseEqual(...)`
- deep equality helpers such as `t.deepEqual(...)` and `t.notDeepEqual(...)`
- deep loose equality helpers
- `t.throws(...)`
- `t.doesNotThrow(...)`
- `t.match(...)`
- `t.doesNotMatch(...)`
- newer interception helpers such as `t.capture(...)`, `t.captureFn(...)`, and
  `t.intercept(...)`

## Runtime Fit In `as-harness`

### Strong fit

These map cleanly onto the existing shared runtime:

- serial top-level `test(...)` declarations
- declaration-level `only` and `skip`
- nested subtests declared through the active per-test context
- assertion planning via the existing assertion scope counter
- strict and deep-strict equality via the shared assertion bridge
- loose primitive equality via the shared `isLooselyEqual(...)` helper
- teardown callbacks via per-node `AfterAll` hook registration
- diagnostic comments via the existing diagnostic event stream

### Partial fit

These can be represented with an explicit AssemblyScript-facing limitation:

- `t.end()` can be modeled as “freeze the current assertion count” rather than
  as JavaScript control flow
- assertion-level `t.skip(msg)` can only be represented as a satisfied
  assertion, not as a distinct TAP skip row
- alias-heavy assertion names are cheap to expose once the base methods exist

### Poor fit today

These want runtime behavior the repo does not currently have:

- async completion from returned Promises or callback-style endings
- timeout enforcement
- regex helpers if they depend on upstream JS `RegExp` behavior
- deep loose structural comparison, because the current bridge only exposes
  primitive loose equality plus deep strict equality
- capture / intercept helpers, which need richer object mutation and structured
  call recording than the current guest model exposes
- `createHarness()` and `createStream()`, which are reporter / TAP stream
  concerns rather than guest declaration concerns

## Honest Shipped Surface

### Top-level

Recommended shipped top-level API:

- default export `test(name: string = "", callback: TestFn | null = null): void`
- `test.only(name, callback)`
- `test.skip(name, callback)`

AssemblyScript-facing divergence:

- do not implement upstream `opts` object overloading in the first shipped
  surface
- if later needed, add an explicit helper such as `test.configure(...)` rather
  than pretending AssemblyScript can honestly mirror JS overloads

### `TestContext`

Recommended shipped adapter-local `TestContext`:

- `name`
- `fullName`
- `passed`
- `error`
- `attempt`
- `test(name, callback)` for nested subtests
- `plan(n)`
- `end()`
- `teardown(cb)`
- `comment(message)`

### Assertions

Recommended shipped assertions:

- `pass(msg)`
- `fail(msg)`
- `ok(value, msg)`
- `assert(value, msg)`
- `true(value, msg)`
- `notOk(value, msg)`
- `false(value, msg)`
- `notok(value, msg)`
- `error(err, msg)`
- `ifError(err)`
- `ifErr(err)`
- `iferror(err)`
- `equal(actual, expected, msg)`
- `equals(actual, expected, msg)`
- `strictEqual(actual, expected, msg)`
- `strictEquals(actual, expected, msg)`
- `isEqual(actual, expected, msg)`
- `is(actual, expected, msg)`
- `notEqual(actual, expected, msg)`
- `notStrictEqual(actual, expected, msg)`
- `notStrictEquals(actual, expected, msg)`
- `notEquals(actual, expected, msg)`
- `isNotEqual(actual, expected, msg)`
- `doesNotEqual(actual, expected, msg)`
- `isInequal(actual, expected, msg)`
- `isNot(actual, expected, msg)`
- `not(actual, expected, msg)`
- `looseEqual(actual, expected, msg)`
- `looseEquals(actual, expected, msg)`
- `notLooseEqual(actual, expected, msg)`
- `notLooseEquals(actual, expected, msg)`
- `deepEqual(actual, expected, msg)`
- `deepEquals(actual, expected, msg)`
- `isEquivalent(actual, expected, msg)`
- `same(actual, expected, msg)`
- `notDeepEqual(actual, expected, msg)`
- `notDeepEquals(actual, expected, msg)`
- `notEquivalent(actual, expected, msg)`
- `notDeeply(actual, expected, msg)`
- `notSame(actual, expected, msg)`
- `isNotDeepEqual(actual, expected, msg)`
- `isNotDeeply(actual, expected, msg)`
- `isNotEquivalent(actual, expected, msg)`
- `isInequivalent(actual, expected, msg)`
- `throws(fn, msg)`
- `doesNotThrow(fn, msg)`

Deliberately deferred from the shipped surface:

- `deepLooseEqual(...)`
- `notDeepLooseEqual(...)`
- `match(...)`
- `doesNotMatch(...)`
- `capture(...)`
- `captureFn(...)`
- `intercept(...)`
- `timeoutAfter(...)`
- `end(err)`
- `test.onFinish(...)`
- `test.onFailure(...)`
- `createHarness()`
- `createStream()`

## Slice Plan

### `tape-001`: interface note and backlog plan

Goal:

- replace the placeholder `tape/TODO.md`
- add this interface note
- add live backlog slices to `agent-todo.md`

Files:

- `docs/018-2026-03-22-tape-adapter-interface.md`
- `assembly/assembly/tape/TODO.md`
- `assembly/roadmap.md`
- `agent-todo.md`
- `CHANGELOG.md`

### `tape-002`: declaration surface and context shell

Goal:

- add `assembly/assembly/tape/index.ts`, `types.ts`, and `parse.ts`
- ship `test(...)`, `test.only(...)`, `test.skip(...)`
- add adapter-local `TestContext` with nested `t.test(...)`, `plan(...)`,
  `end()`, `teardown(...)`, and `comment(...)`
- add internal proof for declaration metadata, nested subtests, and teardown

Files:

- `assembly/assembly/tape/index.ts`
- `assembly/assembly/tape/types.ts`
- `assembly/assembly/tape/parse.ts`
- `assembly/assembly/test/internal/tape.ts`
- `assembly/assembly/test/index.ts`

### `tape-003`: assertion surface and cross-host smoke

Goal:

- add the shipped assertion subset and aliases
- add loose primitive equality through the shared assert bridge
- add one `tape` smoke fixture that exercises nested subtests, plan, teardown,
  comment, strict equality, loose equality, deep equality, throws, and skip /
  only declaration metadata
- prove the adapter through shared host smoke

Files:

- `assembly/assembly/tape/types.ts`
- `assembly/assembly/test/internal/tape.ts`
- `assembly/assembly/test/tape-smoke.ts`
- `harness/shared/smoke-suite.cjs`
- `assembly/assembly/tape/TODO.md`
- `agent-todo.md`
- `CHANGELOG.md`

### `tape-004`: bundled CLI surface and shipped docs

Goal:

- add bundled lib entry `assembly/assembly/lib/tape.ts`
- wire `tape` through CLI compile rewriting
- regenerate virtual files
- add compile coverage and direct bundled CLI proof
- mark `tape` as shipped in READMEs, roadmap, and backlog docs

Files:

- `assembly/assembly/lib/tape.ts`
- `cli/as/compile.ts`
- `cli/as/compile.test.ts`
- `cli/as/virtual-files.generated.ts`
- `cli/run.test.ts`
- `README.md`
- `assembly/README.md`
- `cli/README.md`
- `assembly/roadmap.md`
- `assembly/assembly/tape/TODO.md`
- `agent-todo.md`
- `CHANGELOG.md`

## Acceptance Criteria

Treat the adapter as shipped only when all of the following are true:

1. declaration metadata is stable under internal proof
2. one smoke fixture compiles and runs through `js`, `wazero`, and `wasmtime`
3. bundled CLI compile rewriting recognizes `tape`
4. a direct bundled CLI test proves the shipped `tape` subset
5. docs and backlog files list `tape` as shipped and keep deferred behavior
   explicit
