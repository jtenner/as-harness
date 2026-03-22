# uvu Adapter Interface

This note answers which `uvu` and `uvu/assert` functions are realistic for
`as-harness`, recommends a deferred but well-defined adapter strategy, and
covers the affected guest adapter, shared runtime, and assertion surface in
`assembly/`, `harness/`, and `cli/`. The recommendation is to defer `uvu` from
the full runner slice for now, but to preserve a concrete design: support
`suite(...)`, the returned test object, and a carefully chosen `uvu/assert`
subset. The repo now ships the low-risk `uvu/assert` subset while keeping the
full `uvu` runner surface deferred until the project decides how much
guest-side runner control it is willing to emulate.

## Research Basis

Checked on 2026-03-22 against:

- `uvu@0.5.6` package metadata
- published `index.d.ts`
- published `assert/index.d.ts`
- published `dist/index.mjs`
- published `assert/index.mjs`
- the package README
- current `as-harness` runtime and assertion design

## Short Recommendation

- do not ship the full `uvu` runner surface in the current release line
- ship the low-risk `uvu/assert` subset independently because it does not
  conflict with host-owned `start()`
- if implemented later, support `suite(title?, context?)` and the returned
  suite/test object before attempting the broader runner surface
- keep `exec(...)` out of scope because it conflicts with host-owned `start()`
- treat `test.run()` as the central design question: either adapt it as a
  declaration finalizer/no-op or do not ship `uvu`
- keep the full `uvu` runner surface deferred until the suite API is settled

## Why `uvu` Is Different From `mocha` And `jasmine`

`uvu` is not just a different declaration vocabulary. It also brings a more
runner-shaped in-guest API:

- top-level `test` is already a suite-like object
- `suite()` returns a callable test-registration object with hooks and `.run()`
- `exec()` is a runner control function
- `uvu/assert` assumes thrown `Error`-shaped failures

That means `uvu` is a less direct "thin naming adapter" than `mocha` or
`jasmine`, even though its surface is smaller.

## Upstream Surface Summary

From `uvu`:

- `test`
- `suite(title?, context?)`
- `exec(bail?)`

From the returned `Test<T>` object:

- call signature `(name, test)`
- `.only(name, test)`
- `.skip(name?, test?)`
- `.before(hook)`
- `.before.each(hook)`
- `.after(hook)`
- `.after.each(hook)`
- `.run()`

From `uvu/assert`:

- `ok`
- `is`
- `equal`
- `type`
- `instance`
- `snapshot`
- `fixture`
- `match`
- `throws`
- `not`
- `unreachable`
- `is.not`
- `not.ok`
- `not.equal`
- `not.type`
- `not.instance`
- `not.snapshot`
- `not.fixture`
- `not.match`
- `not.throws`
- `Assertion`

Current shipped subset:

- `ok`
- `is`
- `equal`
- `not`
- `is.not`
- `not.equal`
- `unreachable`

## Current `as-harness` Constraints That Matter

- the host owns execution start through `start()`
- declarations are tree-shaped and replay-driven
- there is no guest-owned notion of "finish registration, then run now"
- execution is synchronous
- Promise-returning tests and hooks are out of scope
- thrown-value inspection is still intentionally narrow
- adapters generally expose direct declarations, not builder objects with their
  own run loop

## Current Repo Shape

The repo now ships a `uvu/assert` subpath only:

```ts
import { equal, is, not, ok, unreachable } from "uvu/assert";
```

Shipped subset:

- `ok`
- `is`
- `equal`
- `not`
- `is.not`
- `not.equal`
- `unreachable`

Reasoning:

- these helpers fit the existing shared assertion bridge directly
- they do not require guest-owned runner control, suite builders, or `.run()`
- they remain useful alongside the already-shipped `node:test`, `mocha`,
  `jasmine`, and `vitest` runner surfaces

## Recommended Eventual Public Shape

If `uvu` is implemented later, the recommended import shape is:

```ts
import { suite, test } from "uvu";
import * as assert from "uvu/assert";
```

But that should happen only after the `.run()` decision is explicit.

## Function-By-Function Plan: `uvu`

### `suite<T = Context>(title?: string, context?: T): Test<T>`

Status: Later, but this is the right starting point.

Game plan:

- map `suite(title, context)` to a suite declaration builder layered over the
  shared tree
- treat `title` as the suite name
- treat `context` as a mutable suite-local state object only if the runtime is
  willing to pass a stable explicit context object into hooks and tests

Primary blocker:

- the current adapters do not expose a builder object with suite-local mutable
  state

### `test`

Upstream status:

- `test` is a pre-created unnamed suite object with the same shape as the
  return value of `suite()`

Status: Later.

Game plan:

- implement as `suite("")`-style top-level singleton only after `suite()` and
  `.run()` semantics are solved

### `exec(bail?: boolean): Promise<void>`

Status: Skip.

Reason:

- `exec()` is a guest-side runner entrypoint
- `as-harness` already has a host-owned runner contract
- emulating both would introduce overlapping orchestration surfaces

## Function-By-Function Plan: Returned `Test<T>` Object

### Callable test registration `(name: string, test: Callback<T>)`

Status: Later, plausible.

Game plan:

- each invocation registers a child test under the current `suite(...)`
- the callback receives a suite/test-local context object if the adapter adopts
  one

Compatibility blocker:

- current adapters do not pass object context with `__suite__` and `__test__`
  crumb fields

### `.only(name, test)`

Status: Later, plausible.

Game plan:

- map to shared `only = true` metadata

### `.skip(name?, test?)`

Status: Later, plausible.

Game plan:

- if a callback is supplied, register a skipped test node
- if only a name is supplied, register a skipped placeholder node

Compatibility note:

- exact upstream behavior is lightweight because `uvu` treats skips largely as
  registration-time runner filtering; the shared skip semantics would still need
  explicit documentation

### `.before(hook)`

Status: Later, plausible.

Game plan:

- map to suite-level `beforeAll`

### `.after(hook)`

Status: Later, plausible.

Game plan:

- map to suite-level `afterAll`

### `.before.each(hook)`

Status: Later, plausible.

Game plan:

- map to suite-level `beforeEach`

### `.after.each(hook)`

Status: Later, plausible.

Game plan:

- map to suite-level `afterEach`

### `.run()`

Status: The main design blocker.

Possible strategies:

1. Treat `.run()` as required declaration finalization and make it a no-op from
   the host's perspective.
2. Auto-run suites at module end and still provide `.run()` as a compatibility
   no-op.
3. Reject `uvu` entirely unless the project is willing to expose a meaningful
   guest-side finalization concept.

Recommendation:

- if `uvu` is ever implemented, choose option 1 and document `.run()` as
  required for source compatibility but semantically redundant under
  host-owned `start()`

Risk:

- a no-op `.run()` is a semantic divergence and must be documented plainly

## Callback Model And Context Plan

Upstream `uvu` callbacks receive a context object plus crumb fields:

- `__suite__`
- `__test__`

Status: Later.

Options:

- preserve this shape exactly and make it the first adapter that passes a
  mutable context object into callbacks
- provide a narrower context object and omit crumb fields

Recommendation:

- if `uvu` lands, preserve the upstream crumb fields because they are a visible
  part of the published type surface

Blocker:

- this would be a new callback-shape pattern in the repo and should be designed
  deliberately rather than slipped into one adapter

## Async Behavior

Upstream `uvu` supports `async` / `await` tests and hooks.

Status: Skip for the first adapter slice.

Blocker:

- same project-wide Promise/runtime limitation as the other deferred async
  adapters

## `uvu/assert` Plan

`uvu/assert` is optional upstream, but if the adapter lands it is worth
providing a meaningful subset because many examples rely on it.

### Ship-Later-But-Good-Fit Functions

- `ok(actual, msg?)`
- `is(actual, expects, msg?)`
- `equal(actual, expects, msg?)`
- `unreachable(msg?)`
- `not(actual, msg?)`
- `is.not(actual, expects, msg?)`
- `not.equal(actual, expects, msg?)`

Why these fit:

- they map onto truthiness, strict equality, deep equality, and negation that
  the shared assertion core already handles

### Plausible Later Functions

- `type(actual, expects, msg?)`
- `snapshot(actual, expects, msg?)`
- `fixture(actual, expects, msg?)`
- `not.type(...)`
- `not.snapshot(...)`
- `not.fixture(...)`

Why only later:

- `type(...)` assumes JavaScript `typeof` categories rather than
  AssemblyScript-native type behavior
- `snapshot` and `fixture` are really string-comparison helpers and are
  feasible, but the naming suggests a broader snapshot workflow than the
  adapter would actually provide

### Blocked Or Poor-Fit Functions

- `instance(actual, expects, msg?)`
- `match(actual, expects, msg?)`
- `throws(fn, expects?, msg?)`
- `not.instance(...)`
- `not.match(...)`
- `not.throws(...)`
- `Assertion`

Primary blockers:

- `instance` depends on constructor and `instanceof` semantics that the guest
  runtime should not casually promise
- `match` depends on `RegExp`-style behavior that is not a reliable
  AssemblyScript-first target
- `throws` expects rich thrown values, regex matching against error messages, or
  predicate functions; the current runtime mostly observes traps and fail
  messages rather than JavaScript exception objects
- exposing the upstream `Assertion` class shape implies a richer error-object
  contract than the current guest assertions provide

## Primary Compatibility Blockers

### 1. `.run()` Conflicts With Host-Owned Execution

This is the core adapter design risk. `uvu` expects the guest test file to
finalize and run suites explicitly. `as-harness` expects the host to discover
and execute through `start()`.

### 2. Builder-Object API Shape

`suite()` returning a callable object with attached hook methods is a different
adapter shape from the repo's current direct-function declarations.

### 3. Context Object Semantics

`uvu` exposes suite/test crumb metadata in callback context. The repo has not
yet committed to that style as a shared adapter pattern.

### 4. Async Hooks And Tests

Upstream `uvu` assumes `async` support broadly. The current runtime does not.

### 5. `uvu/assert` Error Model

The assertion helpers rely on thrown `Assertion` errors and, for some helpers,
regex or constructor matching against thrown values. The current runtime uses a
different failure boundary.

## Exact Recommended Future Export Contract

If the project revisits `uvu`, the honest future contract is:

```ts
export type UvuCallback<T> = (context: T & UvuCrumbs) => void;

export interface UvuCrumbs {
  __suite__: string;
  __test__: string;
}

export interface UvuHook<T> {
  (hook: UvuCallback<T>): void;
  each(hook: UvuCallback<T>): void;
}

export interface UvuTest<T> {
  (name: string, test: UvuCallback<T>): void;
  only(name: string, test: UvuCallback<T>): void;
  skip(name?: string, test?: UvuCallback<T>): void;
  before: UvuHook<T>;
  after: UvuHook<T>;
  run(): void;
}

export function suite<T = Record<string, unknown>>(
  title?: string,
  context?: T,
): UvuTest<T>;

export const test: UvuTest<Record<string, unknown>>;
```

And a first practical `uvu/assert` subset should be:

```ts
export function ok(actual: unknown, msg?: string | null): void;
export function is(actual: unknown, expects: unknown, msg?: string | null): void;
export function equal(actual: unknown, expects: unknown, msg?: string | null): void;
export function unreachable(msg?: string | null): void;
export namespace is {
  function not(
    actual: unknown,
    expects: unknown,
    msg?: string | null,
  ): void;
}
export function not(actual: unknown, msg?: string | null): void;
export namespace not {
  function equal(
    actual: unknown,
    expects: unknown,
    msg?: string | null,
  ): void;
}
```

## Suggested Implementation Order If Revisited

1. decide whether `.run()` is a compatibility no-op or a release blocker
2. decide whether `uvu` gets a context-object callback pattern distinct from the
   other adapters
3. add `suite()` and returned object mechanics
4. add the top-level `test` singleton
5. add the smallest `uvu/assert` subset
6. add compile and smoke proof for `.only`, `.skip`, hooks, and `.run()`
7. document every semantic divergence explicitly before release

## Sources

- `uvu` package metadata (`0.5.6`): https://unpkg.com/uvu@0.5.6/package.json
- README: https://unpkg.com/uvu@0.5.6/readme.md
- `index.d.ts`: https://unpkg.com/uvu@0.5.6/index.d.ts
- `assert/index.d.ts`: https://unpkg.com/uvu@0.5.6/assert/index.d.ts
- `dist/index.mjs`: https://unpkg.com/uvu@0.5.6/dist/index.mjs
- `assert/index.mjs`: https://unpkg.com/uvu@0.5.6/assert/index.mjs
