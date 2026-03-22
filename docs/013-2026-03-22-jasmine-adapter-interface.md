# Jasmine Adapter Interface

This note answers which `jasmine` functions and matcher families are worth
exposing through `as-harness`, recommends a thin synchronous adapter boundary
for `v0.4.0`, and covers the affected guest adapter, shared runtime, and CLI
surface in `assembly/`, `harness/`, and `cli/`. The recommendation is to ship
the declaration DSL, core hooks, `fail`, and a deliberately small `expect(...)`
matcher subset first, while explicitly deferring async expectations, spy APIs,
custom matcher registration, property bags, and most of the mutable `jasmine`
namespace.

## Research Basis

Checked on 2026-03-22 against:

- `jasmine-core@6.1.0`
- `jasmine@6.1.0`
- official Jasmine global API docs
- official `jasmine` namespace docs
- official matcher and async-matcher docs
- official async tutorial
- official custom matcher tutorial
- current `as-harness` runtime and the shipped `jest` / `vitest` adapter model

## Short Recommendation

- ship a `jasmine` module with `describe`, `fdescribe`, `xdescribe`, `it`,
  `fit`, `xit`, `beforeAll`, `afterAll`, `beforeEach`, `afterEach`, `expect`,
  and `fail`
- treat `pending()` as a later runtime feature rather than pretending it is
  identical to declaration-time `todo`
- reuse the current shared matcher core for a narrow first matcher slice
- keep `expectAsync`, spy APIs, custom matcher registration, the mock clock,
  namespace-level environment mutation, and property bag APIs out of scope

## Why `jasmine` Is Still Viable

Despite Jasmine's large surface area, the declaration DSL is still close to the
current runtime:

- `describe` and `it` map onto the existing suite/test tree
- `beforeAll`, `afterAll`, `beforeEach`, and `afterEach` map onto existing hook
  kinds
- focused and excluded aliases map to existing `only` / `skip` metadata
- `expect(...)` can reuse the shared assertion core already proven through
  `jest` and `vitest`

The hard mismatch is not the suite grammar. It is the larger mutable Jasmine
runtime: async expectations, spies, clock control, custom matcher registration,
and reporter-facing state mutation.

## Current `as-harness` Constraints That Matter

- execution is synchronous
- the shared guest runtime has no Promise-based expectation flow
- spy/mocking support is explicitly out of scope for the current project
- adapters are thin facades over shared assertions and hooks
- failure formatting is guest-owned but intentionally narrow
- there is no public host contract for per-spec arbitrary property bags
- there is no browser DOM model or mock-clock environment in the guest runtime

## Recommended Public Shape

```ts
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  fail,
  fdescribe,
  fit,
  it,
  xdescribe,
  xit,
} from "jasmine";
```

Recommended first-slice callback signatures:

```ts
type JasmineSpecFn = () => void;
type JasmineSuiteFn = () => void;
type JasmineHookFn = () => void;
```

The upstream global API also accepts async work and timeouts. The first
`as-harness` slice should not.

## Function-By-Function Plan

### `describe(description, specDefinitions)`

Status: Ship now.

Game plan:

- map to shared suite-node declaration
- require synchronous suite callback

### `fdescribe(...)`

Status: Ship now.

Game plan:

- map to suite declaration with `only = true`

### `xdescribe(...)`

Status: Ship now.

Game plan:

- map to suite declaration with `DeclarationMode.Skip`

Compatibility note:

- as with `mocha`, skipped-suite descendant discovery will follow shared
  `as-harness` semantics, not every nuance of Jasmine's own runtime

### `it(description, testFunction?, timeout?)`

Status: Ship now, but without timeout support.

Game plan:

- if `testFunction` is omitted, declare the spec as pending-like non-runnable
  work
- otherwise register a normal runnable test callback
- ignore the upstream `timeout` parameter for the first slice by not exposing
  it at all

Compatibility note:

- upstream callback-less `it(...)` becomes pending
- the closest current shared mapping is declaration-time `todo`
- whether the adapter reports that as "pending" or "todo" at the CLI layer is a
  wording question that should be documented explicitly

### `fit(...)`

Status: Ship now.

Game plan:

- map to test declaration with `only = true`

### `xit(...)`

Status: Ship now.

Game plan:

- map to test declaration with `DeclarationMode.Skip`

### `beforeAll(function, timeout?)`

Status: Ship now, without timeout support.

Game plan:

- map to shared `beforeAll`
- keep callback synchronous

### `afterAll(function, timeout?)`

Status: Ship now, without timeout support.

Game plan:

- map to shared `afterAll`
- keep callback synchronous

### `beforeEach(function, timeout?)`

Status: Ship now, without timeout support.

Game plan:

- map to shared `beforeEach`
- keep callback synchronous

### `afterEach(function, timeout?)`

Status: Ship now, without timeout support.

Game plan:

- map to shared `afterEach`
- keep callback synchronous

### `expect(actual)`

Status: Ship now, with a narrow matcher subset.

Game plan:

- reuse the current shared matcher machinery already exposed through `jest` and
  `vitest`
- support `.not`
- do not try to mirror every Jasmine matcher in the first slice

### `fail(error?)`

Status: Ship now.

Game plan:

- lower to an immediate guest failure using the shared fail-message path
- accept `string | Error` in the source-facing signature if practical, but do
  not overpromise rich `Error` object reporting beyond current guest
  capabilities

### `pending(message?)`

Status: Later.

Why not now:

- upstream `pending()` is a runtime action that marks the current spec pending
  and ignores expectation results
- the current shared runtime has declaration-time `todo` and skip semantics,
  but not a first-class runtime "convert current test to pending" operation

Recommendation:

- delay this until the runtime has a clear generic concept for runtime skip /
  pending state

### `expectAsync(actual)`

Status: Skip for the first slice.

Blocker:

- all async matchers depend on promise-aware execution and completion tracking
- the current guest runtime is intentionally synchronous

### `setSpecProperty(key, value)` and `getSpecProperty(key)`

Status: Later.

Blocker:

- current host result contracts do not expose an arbitrary user-defined
  per-spec property bag

### `setSuiteProperty(key, value)`

Status: Later.

Blocker:

- same missing host/report contract as above

### `spyOn`, `spyOnAllFunctions`, `spyOnProperty`

Status: Skip.

Blocker:

- spy and mocking support is already an explicit project non-goal for the
  current runtime
- property interception and call tracking do not map cleanly onto
  AssemblyScript's limitations

### `throwUnless(actual)` and `throwUnlessAsync(actual)`

Status: Later for `throwUnless`; skip for `throwUnlessAsync`.

Reasoning:

- `throwUnless` could eventually be built as a thin wrapper over `expect(...)`
  that throws an adapter-specific assertion object instead of recording a normal
  spec failure
- `throwUnlessAsync` has the same Promise blocker as `expectAsync`

## Matcher-By-Matcher Plan

The realistic first slice should classify Jasmine matchers by shared-runtime
fit, not by upstream popularity alone.

### Matchers Worth Shipping In The First Slice

- `toBe(expected)`
- `toEqual(expected)`
- `toBeDefined()`
- `toBeFalsy()`
- `toBeTruthy()`
- `toBeNull()`
- `toBeUndefined()`
- `toContain(expected)`
- `toBeGreaterThan(expected)`
- `toBeLessThan(expected)`
- `toBeNaN()`
- `toThrow(expected?)`
- `.not` on the supported set

Why these fit:

- all have close analogues in the existing shared matcher core
- none require Promise orchestration, spies, DOM APIs, or custom formatter
  registration

### Matchers That Are Plausible Later

- `nothing()`
- `toBeCloseTo(expected, precision?)`
- `toBeFalse()`
- `toBeTrue()`
- `toBeGreaterThanOrEqual(expected)`
- `toBeLessThanOrEqual(expected)`
- `toBeNegativeInfinity()`
- `toBeNullish()`
- `toBePositiveInfinity()`
- `toHaveSize(expected)`
- `toMatch(expected)`
- `withContext(message)`

Why later:

- they are feasible but not yet necessary to make the adapter honest
- some need small additions to numeric comparison, string/regex handling, or
  failure-message composition

### Matchers That Are Blocked Or Poor Fits Right Now

- `toBeInstanceOf(expected)`
- `toHaveBeenCalled()`
- `toHaveBeenCalledBefore(expected)`
- `toHaveBeenCalledOnceWith(...)`
- `toHaveBeenCalledTimes(expected)`
- `toHaveBeenCalledWith(...)`
- `toHaveNoOtherSpyInteractions()`
- `toHaveSpyInteractions()`
- `toHaveClass(expected)`
- `toHaveClasses(expected)`
- `toThrowError(expected?, message?)`
- `toThrowMatching(predicate)`

Primary blockers:

- spy infrastructure does not exist
- DOM element matchers do not fit the guest runtime
- rich thrown-error inspection is a poor fit for the current trap-oriented
  failure model
- `instanceof` and constructor-based reflection need more runtime type
  guarantees than the first slice should promise

## Async Matcher Plan

Upstream async matchers:

- `already`
- `not`
- `toBePending()`
- `toBeRejected()`
- `toBeRejectedWith(expected)`
- `toBeRejectedWithError(expected?, message?)`
- `toBeResolved()`
- `toBeResolvedTo(expected)`
- `withContext(message)`

Status: Skip for the entire first slice.

Blocker:

- every one of these depends on real Promise-aware test execution

## `jasmine` Namespace Plan

The top-level `jasmine` namespace is much larger than the declaration DSL.
Most of it should stay out of scope in the first adapter pass.

### Static Members

- `DEFAULT_TIMEOUT_INTERVAL`: Later at most. Timeout metadata exists in the
  runtime, but enforcement is not a first-slice promise.
- `MAX_PRETTY_PRINT_ARRAY_LENGTH`: Skip.
- `MAX_PRETTY_PRINT_CHARS`: Skip.
- `MAX_PRETTY_PRINT_DEPTH`: Skip.

Reason:

- these are tied to Jasmine's mutable pretty-printer environment, not the
  current guest assertion contract

### Namespace Methods Worth Deferring

- `addMatchers(matchers)`
- `addAsyncMatchers(matchers)`
- `addCustomEqualityTester(tester)`
- `addCustomObjectFormatter(formatter)`
- `addSpyStrategy(name, factory)`
- `setDefaultSpyStrategy(defaultStrategyFn)`

Status: Skip.

Primary blockers:

- dynamic matcher and equality registration depends on closures, mutable runtime
  scope, and broader assertion customization than the current guest runtime
  wants to expose

### Spy And Env Helpers

- `clock()`
- `createSpy(name?, originalFn?)`
- `createSpyObj(baseName?, methodNames, propertyNames?)`
- `isSpy(value)`
- `spyOnGlobalErrorsAsync(fn)`
- `getEnv()`

Status: Skip.

Why:

- these functions belong to Jasmine's larger runner and mocking environment
- they do not fit the current Wasm guest/runtime boundary

### Miscellaneous Helpers

- `debugLog(msg)`: Later at most; could eventually map to guest diagnostics
- `pp(value)`: Later at most; current failure rendering is intentionally narrow

## Primary Compatibility Blockers

### 1. Async Everywhere

Jasmine's public docs assume async specs, async hooks, async expectations, and
async error handling are first-class. The current runtime is not.

### 2. Spy-Centric Matcher Surface

A large part of Jasmine's real-world interface value comes from spies and
spy-aware matchers. That entire surface is currently outside project scope.

### 3. Runtime Pending Semantics

`pending()` is a runtime control flow primitive, not just declaration metadata.
The current shared runtime does not yet expose an equivalent generic operation.

### 4. Namespace Mutation

Custom matchers, equality testers, object formatters, and default spy strategy
all depend on mutable Jasmine environment state. The current adapters are meant
to stay thin and declarative.

### 5. Timeout Parameters

Many global Jasmine functions accept per-call timeouts. The runtime has timeout
metadata, but the project does not currently promise full timeout enforcement.

## Exact Recommended Export Contract

```ts
export type JasmineSuiteFn = () => void;
export type JasmineSpecFn = () => void;
export type JasmineHookFn = () => void;

export interface SuiteDeclaration {
  (description: string, callback?: JasmineSuiteFn | null): void;
}

export interface SpecDeclaration {
  (description: string, callback?: JasmineSpecFn | null): void;
}

export interface Matchers<T> {
  not: Matchers<T>;
  toBe(expected: T, message?: string | null): void;
  toEqual(expected: T, message?: string | null): void;
  toBeDefined(message?: string | null): void;
  toBeFalsy(message?: string | null): void;
  toBeTruthy(message?: string | null): void;
  toBeNull(message?: string | null): void;
  toBeUndefined(message?: string | null): void;
  toContain(expected: T, message?: string | null): void;
  toBeGreaterThan(expected: T, message?: string | null): void;
  toBeLessThan(expected: T, message?: string | null): void;
  toBeNaN(message?: string | null): void;
  toThrow(message?: string | null): void;
}

export const describe: SuiteDeclaration;
export function fdescribe(
  description: string,
  callback?: JasmineSuiteFn | null,
): void;
export function xdescribe(
  description: string,
  callback?: JasmineSuiteFn | null,
): void;

export const it: SpecDeclaration;
export function fit(
  description: string,
  callback?: JasmineSpecFn | null,
): void;
export function xit(
  description: string,
  callback?: JasmineSpecFn | null,
): void;

export function beforeAll(callback?: JasmineHookFn | null): void;
export function afterAll(callback?: JasmineHookFn | null): void;
export function beforeEach(callback?: JasmineHookFn | null): void;
export function afterEach(callback?: JasmineHookFn | null): void;

export function expect<T>(actual: T): Matchers<T>;
export function fail(error?: string | Error | null): void;
```

## Suggested Implementation Order

1. define the thin boundary in a dedicated adapter doc before writing code
2. add `assembly/assembly/jasmine/index.ts` plus bundled lib entry wiring
3. implement declarations and focus/skip aliases
4. implement hooks
5. add `fail`
6. port the smallest shared matcher subset from `jest` / `vitest`
7. add compile fixtures and host smoke proof
8. explicitly document the missing spy/async namespace surface

## Sources

- `jasmine-core` package metadata (`6.1.0`): https://unpkg.com/jasmine-core/package.json
- `jasmine` package metadata (`6.1.0`): https://unpkg.com/jasmine/package.json
- Global API: https://jasmine.github.io/api/edge/global
- `jasmine` namespace: https://jasmine.github.io/api/edge/jasmine.html
- Built-in matchers: https://jasmine.github.io/api/edge/matchers.html
- Async matchers: https://jasmine.github.io/api/edge/async-matchers.html
- Async tutorial: https://jasmine.github.io/tutorials/async
- Custom matchers tutorial: https://jasmine.github.io/tutorials/custom_matchers
