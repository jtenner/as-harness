# Vitest Adapter

Recommended shape for a future thin sync `"vitest"` guest library in `as-harness`.

Research basis:

- official Vitest API docs as published on `vitest.dev` and `main.vitest.dev`
  on 2026-03-19, with the site currently showing `v4.1.0`
- official AssemblyScript implementation-status docs on
  `assemblyscript.org/status.html`
- the current shared guest runtime in
  [`assembly/assembly/internal/`](../assembly/assembly/internal/)
- the shipped thin Jest adapter in [005-2026-03-17-jest-adapter.md](./005-2026-03-17-jest-adapter.md)

Short conclusion:

- `vitest` is the best next adapter to implement after `node:test` and `jest`
- the right target is a thin, synchronous, Jest-shaped subset of Vitest
- broad Vitest parity is not realistic with the current Wasm runtime or the
  current state of AssemblyScript

## Why Pick Vitest Next

`vitest` is the most natural next adapter because it overlaps heavily with what
already exists:

- the shared runtime already understands test nodes, suite nodes, `skip`,
  `todo`, `only`, hooks, and expected-failure metadata
- the shipped Jest adapter already proves a thin Jest-style `expect(...)`
  surface on top of the shared assertion bridge
- Vitest's declaration API is much closer to the shipped runtime than adapters
  like `ava`, `tap`, or `mocha`

By contrast:

- `mocha` relies more heavily on callback `this` semantics and a broader UI
  split
- `ava` is async-first
- `tap` / `tape` want a richer per-test assertion object and plan-driven flow
- `jasmine` still brings a large spy/matcher surface with less direct reuse
  from the current Jest work

So the recommended next adapter is:

- a thin synchronous `vitest` adapter
- intentionally scoped closer to the current Jest adapter than to full upstream
  Vitest parity

## Current Runtime Capabilities

The current guest runtime already gives an adapter these primitives:

- `Test` and `Describe` structural node kinds
- declaration modes `Normal`, `Skip`, and `Todo`
- execution metadata fields for `only`, `expectFailure`, `timeout`,
  `concurrency`, and `plan`
- declaration helpers for tests, suites, and the four standard hook kinds
- synchronous test and suite callbacks
- synchronous hook callbacks
- a shared assertion bridge and trap-observation trampoline

Relevant local implementation points:

- [`internal/api.ts`](../assembly/assembly/internal/api.ts)
- [`internal/node.ts`](../assembly/assembly/internal/node.ts)
- [`internal/context.ts`](../assembly/assembly/internal/context.ts)
- [`internal/executor.ts`](../assembly/assembly/internal/executor.ts)

Important current limits:

- execution is synchronous
- hooks are limited to `beforeAll`, `beforeEach`, `afterEach`, and `afterAll`
- there is no runner support yet for real concurrency, retries, repeats,
  shuffling, or fixture scoping
- timeout and concurrency metadata exist, but the public shipped surface does
  not yet promise full Vitest-like enforcement

## AssemblyScript Constraints That Matter

The official AssemblyScript status page makes these limitations especially
relevant for Vitest adapter design:

- closures with captured local state are not implemented yet
- iterators and `for..of` are not implemented yet
- rest parameters are not implemented yet
- exceptions are not properly implemented; throwing currently aborts
- Promises and `async` / `await` are not available because there is no event
  loop
- union types are largely unsupported
- dynamic JavaScript features are intentionally limited
- runtime reflection is limited, including dynamic function-name lookup
- class/prototype patching and highly dynamic matcher registration do not fit
  the language model

Those limits directly affect:

- parameterized APIs implemented through curried closures
- async hooks and async tests
- promise-oriented matchers like `.resolves` and `.rejects`
- dynamic mock factories and hoisting helpers
- type-introspection helpers built around advanced TypeScript-only type
  features
- function-name overloads like `test(function namedCase() {})`

## Recommendation

The project should implement `vitest` as a thin guest adapter with three
explicit buckets:

1. ship now because the current runtime already maps them cleanly
2. defer because the runner would need more real semantics
3. skip because the upstream API depends on closures, Promises, dynamicness, or
   TypeScript-only machinery that does not fit AssemblyScript well

The first shipped slice should be intentionally small and honest.

## First Shipped Slice

The recommended first public export surface is:

```ts
import {
  afterAll,
  afterEach,
  assertType,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  suite,
  test,
  TestContext,
  SuiteContext,
  ModuleContext,
} from "vitest";
```

Recommended behavior:

- `test` / `it` map to shared test-node declaration
- `describe` / `suite` map to shared suite-node declaration
- `test.only`, `test.skip`, `test.todo`, and `test.fails` map to existing node
  metadata
- `it.*` mirrors `test.*`
- `describe.only`, `describe.skip`, `describe.todo` map to suite metadata
- `suite.*` mirrors `describe.*`
- `beforeAll`, `afterAll`, `beforeEach`, `afterEach` map to the shared hook
  registration layer
- `expect(...)` initially reuses the currently shipped thin Jest matcher set
- `assertType<T>(value)` can be a no-op generic compile-time assertion helper

Recommended AssemblyScript-specific callback shapes:

- `type TestFn = (context: TestContext) => void`
- `type SuiteFn = (context: SuiteContext) => void`
- `type HookFn = (context: TestContext) => void`
- `type ModuleHookFn = (context: ModuleContext) => void`

Recommended context minimum:

- `TestContext.skip(condition: bool = true, message: string | null = null)`
- `TestContext.expect`
- existing shared metadata already exposed by the internal context object where
  it makes sense

`ModuleContext` can be a thin alias shape for suite-level hook callbacks rather
than an attempt at full upstream parity.

## Upstream API Surface And Recommended Status

The rest of this document walks the upstream Vitest surface family by family.

### Legend

- `Ship now`: good fit for the current runtime and AssemblyScript
- `Later`: reasonable after real runner work lands
- `Skip`: should not be part of the adapter target for now

## `test` / `it`

Upstream Vitest `test` currently includes:

- basic declaration
- `timeout`
- `retry`
- `repeats`
- `tags`
- `meta`
- `concurrent`
- `sequential`
- `skip`
- `only`
- `todo`
- `fails`
- `extend`
- `override`
- deprecated `scoped`
- `skipIf`
- `runIf`
- `each`
- `for`
- scoped hook helpers on extended tests
- scoped `describe` / `suite`

### `test(...)` Base Declaration

Upstream shape:

- `test(name: string | Function, body?, timeout?)`
- `test(name: string | Function, options, body?)`
- omitted `body` means `todo`

Recommended status:

- `Ship now`, but only with `name: string`

Recommended guest signature:

```ts
export function test(
  name: string = "",
  callback: TestFn | null = null,
): void;
```

Notes:

- missing callback should mark the test as `todo` to match upstream behavior
- the `name: Function` overload should be skipped because AssemblyScript does
  not support reliable runtime function-name reflection
- do not expose the trailing timeout argument yet unless the runner actually
  enforces it

### `test.only`, `test.skip`, `test.todo`

Recommended status:

- `Ship now`

Direct mapping:

- `test.only` -> `NodeDeclarationOptions.only = true`
- `test.skip` -> `DeclarationMode.Skip`
- `test.todo` -> `DeclarationMode.Todo`

These fit the existing runtime directly.

### `test.fails`

Recommended status:

- `Ship now`

Direct mapping:

- `test.fails` -> `NodeDeclarationOptions.expectFailure = true`

This is already a better semantic fit than most other unimplemented Vitest
features because the shared node model already has explicit expected-failure
metadata.

### `test.skipIf` and `test.runIf`

Recommended status:

- `Ship now`

Reasoning:

- the upstream curried shape can still be matched without captured closures if
  the implementation simply returns one of two existing top-level function
  references
- this is one of the few curried Vitest helpers that does not need to capture
  arbitrary local state inside a returned callback body

Recommended behavior:

- `test.skipIf(true)` returns `test.skip`
- `test.skipIf(false)` returns `test`
- `test.runIf(true)` returns `test`
- `test.runIf(false)` returns `test.skip`

The same applies to `it.skipIf` and `it.runIf`.

### `test.sequential`

Recommended status:

- `Ship now`

Reasoning:

- the current runner is already sequential
- exporting `test.sequential` now is an honest semantic alias of normal test
  declaration in the current runner
- it adds useful named surface compatibility without claiming concurrent
  scheduling support

Current shipped behavior:

- `test.sequential(...)` aliases `test(...)`
- `it.sequential(...)` aliases `it(...)`

### `test.concurrent`

Recommended status:

- `Skip` for now

Reasoning:

- upstream Vitest uses real runner concurrency
- concurrent snapshots and local-context `expect` semantics are runner features,
  not adapter-only sugar
- the current runtime stores `concurrency` metadata but does not provide
  faithful concurrent execution

This should not be exposed until the runner can honor it.

### `timeout`

Recommended status:

- `Later`

Reasoning:

- the shared node model already has a `timeout` field
- Vitest treats timeout as a real enforcement contract
- exposing it before host enforcement exists would create false confidence

This is runner work, not an adapter blocker.

### `retry` and `repeats`

Recommended status:

- `Skip` for now

Reasoning:

- the current execution model has no retry loop
- Vitest's retry options include condition-based behavior and multi-attempt
  execution semantics
- the current `attempt` metadata is not a full retry implementation

### `tags` and `meta`

Recommended status:

- `Later`

Reasoning:

- these are structurally representable as metadata
- they are only useful if the host/reporter contract preserves and reports
  them
- `meta` inheritance is runner behavior, not just adapter parsing

### `test.each` and `test.for`

Recommended status:

- `Skip`

Reasoning:

- the upstream API is closure-heavy and curried
- template-literal table variants depend on formatting and dynamic argument
  spreading
- AssemblyScript has no closure captures and no rest parameters
- the resulting implementation would become AssemblyScript-specific quickly and
  would stop feeling like real Vitest

If parameterized testing becomes important later, it should likely be designed
as explicit AssemblyScript helpers instead of pretending to be full
`test.each(...)`.

### `test.extend`, `test.override`, `test.scoped`

Recommended status:

- `Skip`

Reasoning:

- fixtures are one of the most TypeScript- and async-heavy parts of Vitest
- fixture setup and teardown are promise-based
- fixture inheritance depends on returned extended test functions
- scoped overrides require suite-level fixture state
- `test.scoped` is deprecated upstream anyway

This whole family does not fit the current guest runtime.

### Scoped Helpers On Extended Tests

Upstream also exposes:

- `test.describe`
- `test.suite`
- `test.beforeEach`
- `test.afterEach`
- `test.beforeAll`
- `test.afterAll`
- `test.aroundEach`
- `test.aroundAll`

Recommended status:

- `Skip`

Reasoning:

- these exist to preserve fixture typing after `test.extend`
- without fixture extension, these helpers add little value
- the `around*` helpers have their own blocking issues described below

## `describe` / `suite`

Upstream `describe` currently includes:

- basic suite declaration
- inherited test options
- `shuffle`
- `skip`
- `skipIf`
- `runIf`
- `only`
- `concurrent`
- `sequential`
- `todo`
- `each`
- `for`

### `describe(...)` and `suite(...)`

Recommended status:

- `Ship now`, but only with `name: string`

Recommended guest signature:

```ts
export function describe(
  name: string = "",
  callback: SuiteFn | null = null,
): void;

export function suite(
  name: string = "",
  callback: SuiteFn | null = null,
): void;
```

Notes:

- the `name: Function` overload should be skipped for the same function-name
  reflection reason as `test(...)`
- anonymous names should continue to normalize to `"<anonymous>"`

### `describe.only`, `describe.skip`, `describe.todo`

Recommended status:

- `Ship now`

Direct mapping:

- `describe.only` -> `only = true`
- `describe.skip` -> `DeclarationMode.Skip`
- `describe.todo` -> `DeclarationMode.Todo`

`suite.only`, `suite.skip`, and `suite.todo` should be aliases.

### `describe.skipIf` and `describe.runIf`

Recommended status:

- `Ship now`

Reasoning:

- same implementation strategy as `test.skipIf` / `test.runIf`
- no captured closure is required if the function returns one of two existing
  suite declaration functions

### `describe.sequential`

Recommended status:

- `Ship now`

Reasoning:

- like `test.sequential`, this is an honest alias in the current always-
  sequential runner
- it improves named Vitest surface compatibility without promising any broader
  scheduler behavior

Current shipped behavior:

- `describe.sequential(...)` aliases `describe(...)`
- `suite.sequential(...)` aliases `suite(...)`

### `describe.concurrent`

Recommended status:

- `Skip` for now

Reasoning:

- real parallel suite execution is runner behavior
- the upstream API changes expectation routing for local-context assertions and
  snapshots
- shipping the name without the behavior would be misleading

### `describe.shuffle`

Recommended status:

- `Skip` for now

Reasoning:

- this is pure scheduler behavior
- the shared runtime does not have shuffle metadata or randomized traversal
  today

### Inherited Suite Options

Recommended status:

- `Later`

Reasoning:

- upstream Vitest lets suites propagate options like timeout or metadata to
  nested tests
- this is reasonable later, but it is not part of the current shared runtime
  contract yet

### `describe.each` and `describe.for`

Recommended status:

- `Skip`

Reasoning:

- same closure/currying/template-table problem as `test.each` and `test.for`
- not a good AssemblyScript fit

## Hooks

Upstream Vitest hook families:

- `beforeEach`
- `afterEach`
- `beforeAll`
- `afterAll`
- `aroundEach`
- `aroundAll`
- `onTestFinished`
- `onTestFailed`

### `beforeEach`, `afterEach`, `beforeAll`, `afterAll`

Recommended status:

- `Ship now`, but sync-only

Recommended guest signatures:

```ts
export function beforeEach(callback: HookFn | null = null): void;
export function afterEach(callback: HookFn | null = null): void;
export function beforeAll(callback: ModuleHookFn | null = null): void;
export function afterAll(callback: ModuleHookFn | null = null): void;
```

Recommended deliberate differences from upstream:

- callback return values are ignored
- async callbacks are out of scope
- timeout parameters should stay unexposed until enforced

Notes:

- upstream Vitest allows returning cleanup functions from `beforeEach` and
  `beforeAll`
- the current hook runtime stores only the callback and timeout, not a deferred
  cleanup callback value
- the current executor already has the right four hook slots, so the basic
  synchronous form is a direct fit

### `aroundEach` and `aroundAll`

Recommended status:

- `Skip`

Reasoning:

- upstream `aroundEach` receives a `runTest` callback and wraps test execution
- upstream `aroundAll` receives a `runSuite` callback and wraps suite execution
- these APIs are fundamentally closure- and async-oriented
- the current executor does not expose resumable wrapped execution phases

This is not a good target until both the runner and AssemblyScript have much
stronger support here.

### `onTestFinished` and `onTestFailed`

Recommended status:

- `Skip`

Reasoning:

- these require deferred callback queues attached to the currently running test
- real-world usage commonly captures local state inside the registered callback
- AssemblyScript closure support is the wrong foundation today

## `expect(...)`

Upstream Vitest `expect` is large. It combines:

- Chai assertion chains
- Jest-style matcher methods
- asymmetric matchers
- mock- and spy-aware matchers
- snapshot matchers
- promise-aware matchers
- static helpers such as `extend`, `any`, `anything`, `getState`, and
  `setState`
- execution helpers such as `soft` and `poll`

Trying to mirror all of that is the wrong goal.

### Recommended First `expect(...)` Surface

Recommended status:

- `Ship now`, by reusing the current thin Jest matcher surface

That first Vitest matcher slice should be exactly the already-shipped guest
matcher family documented in [005-2026-03-17-jest-adapter.md](./005-2026-03-17-jest-adapter.md):

- `toBe`
- `toEqual`
- `toStrictEqual`
- `toBeTruthy`
- `toBeFalsy`
- `toBeNull`
- `toBeUndefined`
- `toBeDefined`
- `toContain`
- `toContainEqual`
- `toHaveLength`
- `toBeGreaterThan`
- `toBeLessThan`
- `toBeNaN`
- `toThrow`
- `.not` versions of the above

Reasoning:

- the shared assertion bridge already supports this
- the Jest adapter already proves it works in this runtime
- Vitest intentionally supports Jest-compatible matchers, so this is a real
  subset and not a fake API

### Matchers Worth Considering Later

These are plausible later additions because they still fit a static,
non-promise, non-mock model:

- `toBeCloseTo`
- `toBeGreaterThanOrEqual`
- `toBeLessThanOrEqual`
- `toBeInstanceOf`
- `toBeTypeOf`
- `toMatch`
- `toHaveProperty`
- `toMatchObject`

These should not block the first adapter slice.

### `expect.soft`

Recommended status:

- `Later`

Reasoning:

- upstream `expect.soft` records failures and continues test execution
- the current guest runtime treats assertion failure as immediate failure
  through the active assertion scope and trap path
- implementing this honestly requires multi-failure buffering in the runner

### `expect.poll`

Recommended status:

- `Skip`

Reasoning:

- it is fundamentally async and retry-oriented
- there is no event loop or Promise support in AssemblyScript

### Promise Matchers

This includes:

- `.resolves`
- `.rejects`

Recommended status:

- `Skip`

Reasoning:

- no Promise model
- no async test model

### Snapshot Matchers

This includes families like:

- `toMatchSnapshot`
- `toMatchInlineSnapshot`

Recommended status:

- `Skip`

Reasoning:

- snapshots are explicitly outside the current project scope
- they also require host-side artifact and update semantics

### Mock- and Spy-Aware Matchers

This includes families like:

- `toHaveBeenCalled`
- `toHaveBeenCalledTimes`
- `toHaveBeenCalledWith`
- `toHaveReturned`
- `toHaveReturnedWith`

Recommended status:

- `Skip`

Reasoning:

- these depend on `vi.fn`, `vi.spyOn`, and full call recording support

### Static Matcher Extension

This includes:

- `expect.extend`
- asymmetric helpers like `expect.any(...)`, `expect.anything(...)`, and other
  matcher objects
- matcher state APIs

Recommended status:

- `Skip`

Reasoning:

- they push the adapter toward dynamic matcher registration and object-model
  behavior that does not fit the current AssemblyScript or runtime design

### Chai Chain API On `expect`

Vitest also supports Chai-style forms such as:

- `expect(x).to.equal(...)`
- `expect(x).to.have.been.called()`

Recommended status:

- `Skip`

Reasoning:

- the current Jest-style matcher object is explicit and static
- chain-heavy Chai ergonomics would force a much larger surface for little
  practical value in guest Wasm tests

## `assert`

Upstream Vitest reexports Chai's `assert` API.

Recommended status:

- `Skip`

Reasoning:

- a faithful Chai `assert` surface is very large
- many of its value propositions overlap with `expect(...)` or `node:assert`
- shipping a tiny incompatible subset under the name `assert` would be
  confusing

If users want assertion-heavy code today, they already have:

- `import * as assert from "node:assert"`
- the thin Vitest/Jest-style `expect(...)` surface

## `vi`

Upstream `vi` includes large families such as:

- module mocking and unmocking
- hoisting helpers
- mock/spies and call history
- fake timers and system time controls
- stubbed globals and environment variables
- dynamic import helpers
- wait helpers

Recommended status:

- `Skip`

Reasoning:

- module mocking relies on the JavaScript module loader and hoisting
- mock factories often depend on closures and mutable shared state
- fake timers and time mocking are host/runtime features
- wait helpers are async
- the Wasm guest runtime is intentionally thin and deterministic

This whole family should stay out of scope for the adapter.

## `assertType` And `expectTypeOf`

### `assertType`

Recommended status:

- `Ship now`

Reasoning:

- upstream Vitest already treats it as a runtime no-op
- in AssemblyScript, a generic no-op function still provides useful compile-time
  assignability checking
- it is very cheap to implement honestly

Recommended guest signature:

```ts
export function assertType<T>(value: T): void {}
```

This should be documented as:

- compile-time only
- no runtime behavior
- much narrower than TypeScript's richer type-test ecosystem

### `expectTypeOf`

Recommended status:

- `Skip`

Reasoning:

- upstream `expectTypeOf` is a large chainable type-introspection API
- it depends on advanced TypeScript-only type machinery
- AssemblyScript lacks several key ingredients it assumes, including broad
  union-type support and the same style of type-level metaprogramming

It is not a good fit for the guest runtime surface.

## `bench`

Upstream `bench(...)` is part of Vitest but is not part of the test adapter
that this repo should target.

Recommended status:

- `Skip`

Reasoning:

- benchmarks are a different execution contract
- the current guest runtime is about test declaration, traversal, and result
  events

## Exact Recommended Export Contract

The recommended first implementation contract for `"vitest"` is:

### Declaration Exports

- `test(name?: string, callback?: TestFn | null): void`
- `test.only(name?: string, callback?: TestFn | null): void`
- `test.skip(name?: string, callback?: TestFn | null): void`
- `test.todo(name?: string, callback?: TestFn | null): void`
- `test.fails(name?: string, callback?: TestFn | null): void`
- `test.sequential(name?: string, callback?: TestFn | null): void`
- `test.skipIf(condition: bool): typeof test`
- `test.runIf(condition: bool): typeof test`
- `it(...)` with the same family as `test(...)`
- `describe(name?: string, callback?: SuiteFn | null): void`
- `describe.only(name?: string, callback?: SuiteFn | null): void`
- `describe.skip(name?: string, callback?: SuiteFn | null): void`
- `describe.todo(name?: string, callback?: SuiteFn | null): void`
- `describe.sequential(name?: string, callback?: SuiteFn | null): void`
- `describe.skipIf(condition: bool): typeof describe`
- `describe.runIf(condition: bool): typeof describe`
- `suite(...)` with the same family as `describe(...)`

### Hook Exports

- `beforeAll(callback?: ModuleHookFn | null): void`
- `afterAll(callback?: ModuleHookFn | null): void`
- `beforeEach(callback?: HookFn | null): void`
- `afterEach(callback?: HookFn | null): void`

### Assertion Exports

- `expect<T>(actual: T): Expectation<T>`
- `assertType<T>(value: T): void`

### Type Exports

- `TestContext`
- `SuiteContext`
- `ModuleContext`
- `TestFn`
- `SuiteFn`
- `HookFn`
- `ModuleHookFn`

## Suggested Implementation Order

1. Create `assembly/assembly/vitest/` as a thin wrapper over the same parse and
   declaration helpers used by `node_test` and `jest`.
2. Mirror the current Jest `expect(...)` implementation first instead of trying
   to build a new matcher stack.
3. Add `fails` support immediately because the runtime already has
   `expectFailure`.
4. Add `skipIf` / `runIf` only if a compile smoke proves the returned function
   references work cleanly in AssemblyScript.
5. Add a guest smoke fixture that proves:
   - `test`, `it`, `describe`, and `suite`
   - `skip`, `todo`, `only`, and `fails`
   - the shared hook family
   - the reused `expect(...)` matcher subset
   - `assertType` as a compile-time no-op
6. Do not start on `vi`, fixtures, `each`, `for`, `expectTypeOf`, snapshots, or
   async helpers in the same slice.

## Final Decision

The adapter that should be researched and implemented next is `vitest`.

The exact product decision is:

- implement a thin synchronous Vitest adapter
- intentionally base it on the current `node:test` runtime and the existing
  thin Jest `expect(...)` work
- ship only the declaration, hook, expected-failure, and matcher pieces that
  can be honest today
- explicitly skip the async, closure-heavy, fixture-heavy, mock-heavy, and
  TypeScript-only parts of Vitest

That gives the project a useful and believable `"vitest"` guest library without
pretending to support the parts of Vitest that the current runtime and
AssemblyScript model cannot yet carry.

## Sources

- Vitest Test API: <https://vitest.dev/api/test>
- Vitest Describe API: <https://main.vitest.dev/api/describe>
- Vitest Hooks API: <https://main.vitest.dev/api/hooks>
- Vitest Expect API: <https://vitest.dev/api/expect>
- Vitest `vi` API: <https://vitest.dev/api/vi>
- Vitest `assertType` API: <https://vitest.dev/api/assert-type>
- Vitest `expectTypeOf` API: <https://vitest.dev/api/expect-typeof>
- AssemblyScript implementation status:
  <https://www.assemblyscript.org/status.html>
