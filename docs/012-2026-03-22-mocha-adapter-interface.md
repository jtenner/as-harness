# Mocha Adapter Interface

This note answers which `mocha` user-facing functions are worth exposing
through `as-harness`, recommends a thin BDD-only adapter shape for the current
`v0.4.0` work, and covers the affected guest adapter, shared runtime, and CLI
surface in `assembly/`, `harness/`, and `cli/`. The recommendation is to ship
only the synchronous BDD declaration and hook family first, keep `mocha`-style
`this` context APIs and async completion semantics out of scope, and treat
suite-skip behavior plus callback-context behavior as the primary compatibility
risks.

## Research Basis

Checked on 2026-03-22 against:

- `mocha` package metadata from `mocha@11.7.5`
- official Mocha docs for BDD, hooks, pending tests, exclusive tests,
  inclusive tests, asynchronous code, arrow functions, timeouts, and root hook
  plugins
- current `as-harness` guest/runtime docs and the existing `jest` / `vitest`
  adapter shape

## Short Recommendation

- ship a `mocha` module that models the BDD interface only
- support `describe`, `context`, `it`, `specify`, `before`, `after`,
  `beforeEach`, `afterEach`, plus `only` / `skip` aliases and pending tests by
  omitted callback
- keep callbacks synchronous in the first slice
- do not promise callback `done`, returned `Promise`, `async` / `await`,
  `this.skip()`, `this.timeout()`, `this.slow()`, `this.retries()`, delayed
  root suites, or root hook plugins
- do not attempt to ship Chai integration as part of the adapter

## Why `mocha` Fits At All

Mocha's BDD declaration layer overlaps with the current shared runtime better
than its broader runner model does:

- `describe` / `context` map to the existing suite node shape
- `it` / `specify` map to the existing test node shape
- `before`, `after`, `beforeEach`, and `afterEach` map to the existing hook
  system
- `.only`, `.skip`, and callback-less pending tests overlap with metadata the
  shared planner already understands

The mismatch is not in the declaration grammar. The mismatch is in the runner
semantics around callback `this`, async completion, root hooks, and suite-skip
behavior.

## Current `as-harness` Constraints That Matter

The current guest/runtime boundary matters more than Mocha surface breadth:

- execution is synchronous
- adapters lower into a shared tree and shared host-owned `start()` planner
- there is no guest-owned runner entry like Mocha's own process-level control
- hooks are the shared four standard kinds only
- there is no Promise support strong enough to model upstream async contracts
- current adapters prefer explicit context arguments, not callback `this`
- skip/todo semantics are already defined by the shared traversal and planner

These constraints mean the first `mocha` slice must be honest and narrow.

## Interface Choice

Mocha has multiple interface families. The recommended `as-harness` adapter
should target only the BDD family in the first slice.

Reasoning:

- BDD is the most familiar Mocha surface and matches the repo's existing
  `jest` / `vitest` / `node:test` declaration style
- TDD (`suite`, `test`, `setup`, `teardown`) adds naming breadth but little new
  runtime value
- QUnit and `exports` interfaces add additional naming or module-shape work
  without changing the underlying runtime fit
- the first adapter should prove the runtime fit before multiplying aliases

## Recommended Public Shape

```ts
import {
  after,
  afterEach,
  before,
  beforeEach,
  context,
  describe,
  it,
  specify,
  xcontext,
  xdescribe,
  xit,
  xspecify,
} from "mocha";
```

Recommended callback signatures for the first slice:

```ts
type MochaTestFn = () => void;
type MochaSuiteFn = () => void;
type MochaHookFn = () => void;
```

This is intentionally narrower than upstream, which allows async callbacks and
binds a Mocha context object as `this`.

## Function-By-Function Plan

### `describe(description, callback)`

Status: Ship now.

Game plan:

- map to shared suite-node declaration
- require `description: string`
- require synchronous `callback`
- allow nesting exactly the same way the current shared tree already allows

Compatibility notes:

- upstream `describe()` must be synchronous; this matches the current runtime
- suite callback `this` should not be promised in the first slice

### `context(description, callback)`

Status: Ship now.

Game plan:

- make `context` a direct alias of `describe`
- keep all semantics identical

Compatibility notes:

- no separate runtime behavior is needed

### `describe.only(description, callback)` and `context.only(...)`

Status: Ship now.

Game plan:

- map to shared suite declaration with `only = true`
- let the existing traversal and planner enforce visible-child filtering and
  blocked dependency behavior

Compatibility notes:

- upstream Mocha warns that `.only()` is incompatible with parallel mode
- `as-harness` already owns scheduling centrally, so the relevant contract here
  is filtered visibility and deterministic planning rather than Mocha's own
  worker model

### `describe.skip(description, callback)` and `context.skip(...)`

Status: Ship now, with an explicit compatibility warning.

Game plan:

- map to shared suite declaration with `DeclarationMode.Skip`
- preserve the current `as-harness` meaning that skipped suites do not discover
  or execute descendants

Compatibility blocker:

- upstream Mocha still invokes skipped suite callbacks so it can build suite
  structure for visualization
- current `as-harness` skip pruning is stricter: skipped suites suppress
  descendant discovery
- this is the biggest first-slice semantic divergence in the Mocha DSL

Recommendation:

- document the divergence explicitly instead of trying to emulate Mocha's
  skipped-suite callback execution in the first slice

### `xdescribe(...)` and `xcontext(...)`

Status: Ship now.

Game plan:

- implement as aliases of `describe.skip(...)` and `context.skip(...)`

### `it(description, callback?)`

Status: Ship now.

Game plan:

- map to shared normal test-node declaration
- if `callback` is omitted or `null`, declare the test as pending
- otherwise register a normal runnable test callback

Compatibility notes:

- callback-less pending tests match upstream well
- the callback itself stays synchronous in the first slice

### `specify(description, callback?)`

Status: Ship now.

Game plan:

- implement as an alias of `it(...)`

### `it.only(...)` and `specify.only(...)`

Status: Ship now.

Game plan:

- map to shared test declaration with `only = true`

### `it.skip(...)` and `specify.skip(...)`

Status: Ship now.

Game plan:

- map to shared test declaration with `DeclarationMode.Skip`

Compatibility notes:

- upstream skipped tests are reported as pending
- current `as-harness` reporting distinguishes skipped/todo/filtered behavior
  through shared planner and summary data, so user-facing CLI copy may need a
  Mocha-specific wording review later

### `xit(...)` and `xspecify(...)`

Status: Ship now.

Game plan:

- implement as aliases of `it.skip(...)` and `specify.skip(...)`

### `before(callback)` and `after(callback)`

Status: Ship now.

Game plan:

- map to shared `beforeAll` / `afterAll`-equivalent hook registration
- keep callback synchronous

Compatibility notes:

- upstream hook descriptions are optional; the first slice can ignore them and
  accept only the callback form

### `beforeEach(callback)` and `afterEach(callback)`

Status: Ship now.

Game plan:

- map directly to the shared per-test hook registration layer
- keep callback synchronous

### Optional Hook Descriptions

Upstream shape:

- `beforeEach("description", fn)`
- same for the other hook forms

Status: Later.

Reasoning:

- upstream uses descriptions mainly for hook error labeling
- current shared event and report contracts do not yet expose hook names as a
  meaningful user-level surface
- accepting and discarding the string would be misleading

## Upstream Features That Must Stay Out Of Scope In The First Slice

### Async Completion via `done`

Upstream status:

- test and hook callbacks may accept a `done` callback
- `done(err)` fails
- `done()` passes

Status: Skip for the first slice.

Blocker:

- the guest runtime is currently synchronous and Promise-free
- adding Node-style callback completion would create adapter-local semantics not
  shared by the rest of the runtime

### Returned `Promise`

Upstream status:

- tests and hooks may return a promise
- returning a promise and also calling `done` is an error

Status: Skip for the first slice.

Blocker:

- Promise support is still out of scope for the guest runtime

### `async` / `await`

Upstream status:

- async functions are supported in tests and hooks

Status: Skip for the first slice.

Blocker:

- same Promise/runtime limitation as above

### `describe()` Async Behavior

Upstream status:

- `describe()` itself must stay synchronous

Status: Match upstream.

Implication:

- this is not a blocker; it aligns with the current runtime well

### Callback `this` Context

Upstream status:

- classic function callbacks can access Mocha context via `this`
- arrow functions are discouraged because they cannot access Mocha context

Status: Skip for the first slice.

Primary blocked members:

- `this.skip()`
- `this.timeout(ms)`
- `this.slow(ms)`
- `this.retries(n)`

Why blocked:

- current adapters do not bind a mutable runner-owned `this`
- the shared runtime already has explicit metadata paths and explicit context
  arguments elsewhere
- emulating Mocha context would be a non-trivial adapter and runtime design
  change

### Chainable `.timeout()`, `.slow()`, `.retries()`

Upstream status:

- suite, test, and hook declarations may be chain-called in some contexts

Status: Skip for the first slice.

Blocker:

- current adapter declarations return `void`
- shipping chainable modifier objects would be a new declaration contract

### Runtime Skip via `this.skip()`

Upstream status:

- tests and some hooks may call `this.skip()` at runtime
- calling `this.skip()` in `after all` is disallowed

Status: Later, not first-slice.

Reasoning:

- the shared runtime already has skip-like concepts, but not through Mocha's
  callback context
- if runtime skip matters later, it should probably be implemented through a
  shared explicit context API rather than Mocha-only `this` magic

### Root Hooks And Root Hook Plugins

Upstream status:

- Mocha supports root hooks and plugin-loaded root hook registrations

Status: Skip.

Blocker:

- `as-harness` owns module execution and host startup differently
- plugin-loaded process-global hook registration does not fit the bundled guest
  library model

### Delayed Root Suite / `run()`

Upstream status:

- Mocha can delay root-suite start with `--delay` and a special global `run()`

Status: Skip.

Blocker:

- `as-harness` already has a host-owned start pipeline and targeted execution
- guest-side runner start control would directly conflict with that design

## Compatibility Risks To Call Out Explicitly

### 1. Skipped Suite Callback Execution

Upstream Mocha still invokes the suite body for `describe.skip(...)` to build
structure. `as-harness` currently prunes skipped-suite descendants. This is the
largest semantic mismatch and should be documented in the adapter note and
README when implemented.

### 2. Callback `this` Is Missing

Any Mocha sample that uses classic-function `this` will not be portable to the
first `as-harness` adapter. That affects `skip`, `timeout`, `slow`, `retries`,
and other context-driven behavior.

### 3. Async Examples Will Not Port

Large amounts of public Mocha documentation use `done`, promise returns, or
`async` functions. The first adapter will necessarily reject or omit those
forms.

### 4. Chai-Centric Mocha Examples Are Not Adapter Scope

Mocha itself is assertion-library-neutral. Many public examples assume Chai or
Should.js. The `as-harness` adapter should not imply bundled Chai support.

### 5. Root Hook Guidance Does Not Transfer Cleanly

Mocha's process-wide setup model does not map onto the current guest-library
shape, where declarations and hooks are module-local guest code executed under
host-owned orchestration.

## Exact Recommended Export Contract

```ts
export type MochaSuiteFn = () => void;
export type MochaTestFn = () => void;
export type MochaHookFn = () => void;

export interface SuiteDeclaration {
  (description: string, callback?: MochaSuiteFn | null): void;
  only(description: string, callback?: MochaSuiteFn | null): void;
  skip(description: string, callback?: MochaSuiteFn | null): void;
}

export interface TestDeclaration {
  (description: string, callback?: MochaTestFn | null): void;
  only(description: string, callback?: MochaTestFn | null): void;
  skip(description: string, callback?: MochaTestFn | null): void;
}

export const describe: SuiteDeclaration;
export const context: SuiteDeclaration;
export const it: TestDeclaration;
export const specify: TestDeclaration;

export function xdescribe(
  description: string,
  callback?: MochaSuiteFn | null,
): void;
export function xcontext(
  description: string,
  callback?: MochaSuiteFn | null,
): void;
export function xit(
  description: string,
  callback?: MochaTestFn | null,
): void;
export function xspecify(
  description: string,
  callback?: MochaTestFn | null,
): void;

export function before(callback?: MochaHookFn | null): void;
export function after(callback?: MochaHookFn | null): void;
export function beforeEach(callback?: MochaHookFn | null): void;
export function afterEach(callback?: MochaHookFn | null): void;
```

## Suggested Implementation Order

1. add a design-facing `docs/` note or README section that makes the BDD-only
   boundary explicit
2. add `assembly/assembly/mocha/index.ts` plus a bundled lib entry file
3. implement suite/test declarations and aliases
4. implement hooks
5. add compile fixtures for declarations, aliases, and pending tests
6. add shared smoke for declaration, skip, only, and hook ordering
7. add CLI smoke across `js`, `wazero`, and `wasmtime`
8. document the skipped-suite divergence explicitly before release

## Sources

- Mocha package metadata (`11.7.5`): https://unpkg.com/mocha/package.json
- BDD interface: https://mochajs.org/interfaces/bdd/
- Hooks: https://mochajs.org/features/hooks/
- Pending tests: https://mochajs.org/declaring/pending-tests/
- Exclusive tests: https://mochajs.org/declaring/exclusive-tests/
- Inclusive tests: https://mochajs.org/declaring/inclusive-tests/
- Asynchronous code: https://mochajs.org/features/asynchronous-code/
- Arrow functions: https://mochajs.org/next/features/arrow-functions/
- Timeouts: https://mochajs.org/features/timeouts/
- Root hook plugins: https://mochajs.org/features/root-hook-plugins/
