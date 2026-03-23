# AVA Adapter Interface

This note answers which `ava` functions, chained modifiers, execution-context
members, assertion helpers, types, and classes matter for an `as-harness`
adapter, recommends an honest first slice centered on synchronous flat test
declarations plus shared assertions, and identifies the affected work across
`assembly/`, `cli/`, and `harness/`. The recommendation is to treat AVA as a
declaration-and-context adapter, not as a runner-parity target: ship the
flat `test(...)` family, the hook family, `test.macro(...)`, and the
expect-failure modifiers that map cleanly onto the shared runtime, while
explicitly deferring Promise / observable execution, `t.try(...)`, timeout
control, teardown callbacks, and AVA's snapshot-directory contract until the
shared runtime can represent them honestly.

## Research Basis

Checked on 2026-03-22 against:

- published `ava@7.0.0` package metadata and type declarations
- AVA's published chain implementation in `lib/create-chain.js`
- AVA's argument parsing in `lib/parse-test-args.js`
- official docs for writing tests, execution context, assertions, snapshots,
  and timeouts
- current `as-harness` guest/runtime docs plus the shipped `jest`, `vitest`,
  `mocha`, `jasmine`, and `uvu` adapter boundaries

Primary references:

- [AVA package on npm](https://www.npmjs.com/package/ava)
- [AVA `readme.md`](https://raw.githubusercontent.com/avajs/ava/main/readme.md)
- [AVA `docs/01-writing-tests.md`](https://raw.githubusercontent.com/avajs/ava/main/docs/01-writing-tests.md)
- [AVA `docs/02-execution-context.md`](https://raw.githubusercontent.com/avajs/ava/main/docs/02-execution-context.md)
- [AVA `docs/03-assertions.md`](https://raw.githubusercontent.com/avajs/ava/main/docs/03-assertions.md)
- [AVA `docs/04-snapshot-testing.md`](https://raw.githubusercontent.com/avajs/ava/main/docs/04-snapshot-testing.md)
- [AVA `docs/07-test-timeouts.md`](https://raw.githubusercontent.com/avajs/ava/main/docs/07-test-timeouts.md)
- [AVA `types/test-fn.d.cts`](https://raw.githubusercontent.com/avajs/ava/main/types/test-fn.d.cts)
- [AVA `types/assertions.d.cts`](https://raw.githubusercontent.com/avajs/ava/main/types/assertions.d.cts)
- [AVA `types/try-fn.d.cts`](https://raw.githubusercontent.com/avajs/ava/main/types/try-fn.d.cts)
- [AVA `lib/create-chain.js`](https://raw.githubusercontent.com/avajs/ava/main/lib/create-chain.js)
- [AVA `lib/parse-test-args.js`](https://raw.githubusercontent.com/avajs/ava/main/lib/parse-test-args.js)

## Short Recommendation

- ship only the main `"ava"` entrypoint, not AVA's CLI or plugin surface
- keep the adapter flat: AVA has no `describe(...)` / nested suite DSL
- model the declaration chain:
  `test`, `test.serial`, `test.only`, `test.skip`, `test.todo`,
  `test.failing`, hook families, and their documented chained variants
- ship `test.macro(...)` because it is declaration-time sugar that fits the
  current guest model
- map `.failing` to the shared expected-failure metadata already used by other
  adapters
- keep implementations synchronous in the first slice even though upstream AVA
  supports promises, async functions, and observables
- defer `t.try(...)`, `t.timeout(...)`, `t.teardown(...)`, async assertions,
  and AVA's own snapshot-directory behavior
- do not promise full AVA concurrency or worker-file isolation semantics

## Why AVA Is A Mixed Fit

What fits well:

- AVA's file-local declaration model is flat and simple
- the core DSL is one `test(...)` chain rather than several competing suite
  interfaces
- `skip`, `todo`, `only`, and expected-failure semantics all overlap with
  metadata the shared runtime already understands
- hooks map onto the existing four standard hook kinds
- macros are declaration-time helpers, not a separate runtime

What does not fit well:

- AVA is async-first and treats promises, async functions, and observables as
  first-class execution results
- AVA's default concurrency model is central to its identity
- `t.try(...)` creates nested attempt execution with commit / discard state
- `t.teardown(...)` registers post-test callbacks with reverse-order execution
- `t.timeout(...)` changes liveness behavior inside one running test
- AVA snapshots assume their own path layout and snapshot report files

So AVA is viable only as a deliberately thin and explicit subset unless the
shared runtime grows substantially richer async and lifecycle semantics.

## Public Entry Point Inventory

The published main entrypoint exports one default value:

```ts
import test from "ava";
```

That default value is a callable chain object typed as `TestFn`.

### Core callable declarations

- `test(title, implementation, ...args)`
- `test(macro, ...args)`
- `test.serial(...)`
- `test.only(...)`
- `test.skip(...)`
- `test.todo(title)`
- `test.failing(...)`
- `test.failing.only(...)`
- `test.failing.skip(...)`
- `test.serial.only(...)`
- `test.serial.skip(...)`
- `test.serial.todo(title)`
- `test.serial.failing(...)`
- `test.serial.failing.only(...)`
- `test.serial.failing.skip(...)`

### Hook declarations

- `test.before(...)`
- `test.before.skip(...)`
- `test.beforeEach(...)`
- `test.beforeEach.skip(...)`
- `test.after(...)`
- `test.after.skip(...)`
- `test.after.always(...)`
- `test.after.always.skip(...)`
- `test.afterEach(...)`
- `test.afterEach.skip(...)`
- `test.afterEach.always(...)`
- `test.afterEach.always.skip(...)`
- the same hook families under `test.serial.*`

### Helper properties

- `test.macro(...)`
- `test.meta.file`
- `test.meta.snapshotDirectory`

Runtime note:

- AVA's actual runtime chain also exposes a `test.default` compatibility proxy
  for CommonJS / TypeScript interop, but that is not part of the public source
  API that the `as-harness` guest adapter needs to target

## Chain Rules AVA Actually Enforces

From AVA's own `lib/create-chain.js`:

- `serial` must appear first
- `only` and `skip` are terminal
- `failing` is terminal except that it may be followed by `only` or `skip`
- `only` and `skip` cannot be chained together
- no repeated modifiers
- hooks never support `only`
- `always` exists only on `after` and `afterEach`
- hook `.skip` is terminal
- `.todo()` is available only as `test.todo(...)` and `test.serial.todo(...)`

These chain restrictions matter because an adapter should encode the same
surface rather than inventing unsupported modifier combinations.

## Function-By-Function Plan

### `test(title, implementation, ...args)`

Status: viable first-slice candidate.

Game plan:

- map to a flat shared test declaration
- require synchronous declaration-time execution
- allow additional macro arguments exactly as AVA does
- require unique visible titles per file

Compatibility notes:

- upstream implementations may return `PromiseLike<void>` or an observable-like
  `Subscribable`; the first slice should reject or explicitly not support those
  returns
- AVA permits omitted title when using a macro with a title generator; the
  adapter should preserve that path

### `test.serial(...)`

Status: viable first-slice candidate, but only with explicit semantics.

Game plan:

- lower to the nearest honest shared serialized-execution metadata
- keep the meaning local to the declaring file / module

Compatibility notes:

- upstream AVA runs serial tests before concurrent ones within one file
- `as-harness` does not have AVA's exact "serial first, concurrent later"
  runner contract today, so the adapter should document the actual guarantee it
  provides, likely "serialized relative ordering" rather than AVA's exact phase
  ordering

### `test.only(...)`

Status: viable first-slice candidate.

Game plan:

- lower to existing `only` metadata
- keep the effect file-local, matching AVA's docs

### `test.skip(...)`

Status: viable first-slice candidate.

Game plan:

- lower to existing skip metadata
- require the implementation argument, matching AVA

### `test.todo(title)` and `test.serial.todo(title)`

Status: viable first-slice candidate.

Game plan:

- lower to shared `todo` metadata
- accept title only

### `test.failing(...)`

Status: viable first-slice candidate.

Game plan:

- map to the shared expected-failure contract already used in other adapters
- preserve the "unexpected pass fails the run" semantics

Compatibility notes:

- this is the clearest part of AVA that already matches current runtime
  behavior

### Hook families

Status: viable first-slice candidate for the declaration surface, but not for
AVA's async behavior.

Functions to model:

- `test.before(...)`
- `test.beforeEach(...)`
- `test.after(...)`
- `test.after.always(...)`
- `test.afterEach(...)`
- `test.afterEach.always(...)`
- serial and skip variants of the above

Game plan:

- map `before` to shared `beforeAll`
- map `beforeEach` to shared `beforeEach`
- map `after` to shared `afterAll`
- map `afterEach` to shared `afterEach`
- map `.always()` to the same hook kind but document the divergence until the
  shared runtime has a clearer "run even after prior failures" contract

Compatibility notes:

- AVA's `after.always()` and `afterEach.always()` are cleanup-oriented behavior
  guarantees, not just aliases
- skipped tests in AVA suppress related per-test hooks; the adapter should
  document whether the shared runtime already matches that exactly
- `test.serial.beforeEach()` does not serialize the tests themselves upstream;
  it only marks the hook declaration. The adapter should not overclaim

### `test.macro(...)`

Status: should ship in the first honest slice.

Why:

- macros are declaration-time helpers
- they do not require a new host ABI
- the current runtime can already accept additional declaration arguments and a
  generated title

Needed behavior:

- `test.macro(exec)`
- `test.macro({ exec, title })`
- title generation from `title(providedTitle, ...args)`
- whitespace normalization of generated titles to AVA's current trimmed,
  collapsed-space behavior

AssemblyScript-facing note:

- guest code cannot honestly mirror AVA's overloaded
  `test(macro, ...args)` and `test(title, macro, ...args)` declarations
- the adapter should therefore expose the macro factory as `test.macro(...)`
  but lower declarations through explicit helpers such as `test.use(...)` and
  `test.useNamed(...)` plus the equivalent modifier variants
- that divergence is acceptable because it preserves the real macro semantics
  without inventing unsupported guest-language overloading

### `test.meta`

Status: partial first-slice candidate.

Properties:

- `test.meta.file`
- `test.meta.snapshotDirectory`

Recommendation:

- `file`: reasonable to expose once the adapter has one stable source-file
  string contract
- `snapshotDirectory`: defer or adapt carefully, because AVA's snapshot layout
  does not match the current `as-harness` host-owned snapshot contract in
  [016-2026-03-22-snapshot-artifact-contract.md](./016-2026-03-22-snapshot-artifact-contract.md)

### `t.log(...values)` and `t.log.skip(...values)`

Status: viable first-slice candidate.

Game plan:

- lower normal `t.log(...)` to the shared diagnostic/log path
- treat `.skip(...)` as a no-op that still matches AVA's plan-count-neutral
  surface

### `t.plan(count)` and `t.plan.skip(count)`

Status: likely defer.

Why:

- AVA fails tests with zero assertions by default
- AVA planning is tightly coupled to its assertion lifecycle
- the current shared runtime does not expose an AVA-shaped per-test assertion
  count contract

### `t.teardown(fn)`

Status: defer.

Why:

- upstream AVA registers LIFO cleanup callbacks after a test finishes
- the current shared runtime does not expose a post-test callback stack that is
  distinct from hooks

### `t.timeout(ms, message?)` and `t.timeout.clear()`

Status: defer.

Why:

- upstream AVA resets timeouts after each assertion
- the current shared runtime does not expose assertion-aware timeout control

### `t.try(...)`

Status: defer.

Why:

- this is effectively nested attempt execution with explicit commit / discard
- it needs isolated assertion bookkeeping, logs, and error accumulation
- it is asynchronous even when the attempted implementation is otherwise simple

### Assertion methods on `t`

Status: split surface.

Viable through existing shared assertion machinery:

- `t.pass(message?)`
- `t.fail(message?)`
- `t.assert(actual, message?)`
- `t.truthy(actual, message?)`
- `t.falsy(actual, message?)`
- `t.true(actual, message?)`
- `t.false(actual, message?)`
- `t.is(actual, expected, message?)`
- `t.not(actual, expected, message?)`
- `t.deepEqual(actual, expected, message?)`
- `t.notDeepEqual(actual, expected, message?)`
- `t.like(actual, selector, message?)`
- `t.regex(string, regex, message?)`
- `t.notRegex(string, regex, message?)`
- `t.throws(fn, expectation?, message?)`
- `t.notThrows(fn, message?)`

Likely defer in the first slice:

- `t.snapshot(expected, message?)`
- `t.throwsAsync(...)`
- `t.notThrowsAsync(...)`

Why:

- `snapshot(...)` wants AVA's own snapshot path contract and reporting model
- the async throw helpers depend on Promise support

Assertion skip modifiers:

- every built-in assertion also exposes `.skip(...)`
- those skip helpers should either be modeled consistently across the whole
  first slice or deferred consistently; partial one-off support would be
  confusing

## Types The Adapter Needs To Model

The main published named types are:

- `TestFn`
- `AfterFn`
- `AlwaysInterface`
- `BeforeFn`
- `FailingFn`
- `HookSkipFn`
- `OnlyFn`
- `SerialFn`
- `SkipFn`
- `TodoFn`
- `ExecutionContext`
- `LogFn`
- `PlanFn`
- `TimeoutFn`
- `TeardownFn`
- `ImplementationFn`
- `Implementation`
- `Macro`
- `MacroFn`
- `MacroDeclarationOptions`
- `TitleFn`
- `Meta`
- `Assertions`
- one named type alias for each assertion helper, including
  `AssertAssertion`, `DeepEqualAssertion`, `LikeAssertion`, `FailAssertion`,
  `FalseAssertion`, `FalsyAssertion`, `IsAssertion`, `NotAssertion`,
  `NotDeepEqualAssertion`, `NotRegexAssertion`, `NotThrowsAssertion`,
  `NotThrowsAsyncAssertion`, `PassAssertion`, `RegexAssertion`,
  `SnapshotAssertion`, `ThrowsAssertion`, `ThrowsAsyncAssertion`,
  `TrueAssertion`, and `TruthyAssertion`
- `ErrorConstructor`
- `ThrownError`
- `ThrowsExpectation`
- `ThrowsAnyExpectation`
- `TryFn`
- `TryResult`
- `CommitDiscardOptions`
- `AssertionError`
- `Subscribable`

Recommendation:

- do not attempt a byte-for-byte TypeScript parity layer in the guest library
- instead expose AssemblyScript-friendly callback and context types that keep
  the same conceptual API names while documenting where generic TypeScript
  expressiveness cannot be mirrored

## Classes

There are no public classes exported from AVA's main `"ava"` entrypoint that an
`as-harness` adapter needs to re-create.

Important non-class surfaces that may look class-like in docs or types:

- `ExecutionContext` is a structural object type
- `TryResult` is a structural result object with methods
- `ErrorConstructor` is a constructor type constraint, not a shipped AVA class
- `Subscribable` is a structural observable-like contract, not a concrete class

## Honest First Slice Boundary

If this repo decides to ship an AVA adapter before async support exists, the
most honest first boundary is:

- declaration family:
  `test`, `test.serial`, `test.only`, `test.skip`, `test.todo`,
  `test.failing`, and the documented chained test variants
- hook family:
  `before`, `beforeEach`, `after`, `afterEach`, with `skip` variants
- `test.macro(...)`
- `test.meta.file` only if one stable source-file string contract exists
- execution context:
  `t.title`, `t.context`, `t.log(...)`, and a shared assertion subset
- expected-failure lowering through the shared planner

Explicit non-goals for that slice:

- Promise-returning tests and hooks
- async functions and observables
- `t.try(...)`
- `t.timeout(...)`
- `t.teardown(...)`
- AVA's exact snapshot directory and report-file behavior
- exact AVA file-level concurrency semantics

## Suggested Implementation Order

1. add a dedicated `ava` interface note and keep the TODO file pointed at it
2. implement the flat declaration chain and chain validation
3. ship `test.macro(...)` plus an explicit declaration helper layer and title
   generation
4. map `.failing` onto the existing expected-failure metadata
5. add one guest traversal / execution fixture proving flat declarations and
   hooks through `js`, `wazero`, and `wasmtime`
6. add a narrow `ExecutionContext` plus shared assertion subset
7. leave async execution, `t.try(...)`, timeout, teardown, and snapshot parity
   explicitly deferred

## Bottom Line

The AVA adapter is not blocked by missing suite syntax. It is blocked by AVA's
async-first execution model and by execution-context features that go beyond
this repo's current shared runtime. The public API that matters is still
manageable: one flat `test` chain, four hook families, macro support, a
structured `ExecutionContext`, and a sizeable assertion surface. A truthful
first adapter should ship only the declaration and shared-assertion pieces that
fit the current runtime, and defer everything that depends on Promise,
observable, nested-attempt, or AVA-specific snapshot semantics.
