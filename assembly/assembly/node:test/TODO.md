# `node:test` Adapter TODO

## Current Status

The first declaration-registration slice now exists for the package-style
`node:test` lib entry point, and the shared runtime now has a first runnable
executor for normal nodes. The currently implemented surface is:

- top-level `test(...)`, `it(...)`, `suite(...)`, and `describe(...)`
- declaration modifiers on those exports: `.skip(...)`, `.todo(...)`,
  `.only(...)`, and `.expectFailure(...)`
- top-level shorthand exports: `skip(...)`, `todo(...)`, `only(...)`, and
  `expectFailure(...)`
- top-level hook registration: `before(...)`, `after(...)`, `beforeEach(...)`,
  and `afterEach(...)`
- declaration-time `TestContext.test(...)`, `t.before(...)`, `t.after(...)`,
  `t.beforeEach(...)`, and `t.afterEach(...)`
- declaration-time metadata getters on `SuiteContext` and `TestContext` for
  `name`, `fullName`, `filePath`, and `signal`, plus `passed`, `error`,
  `attempt`, and `workerId` placeholders on `TestContext`
- declaration-time `t.skip(...)` and `t.todo(...)` that retag the active node's
  declaration mode during callback discovery
- a first `t.assert` facade bound onto the current synchronous `node:assert`
  bridge for `ok`, strict `equal` / `notEqual`, strict
  `deepEqual` / `notDeepEqual`, `strictEqual`, `notStrictEqual`,
  `deepStrictEqual`, `notDeepStrictEqual`, `throws`, `doesNotThrow`,
  `ifError`, and `fail`
- declaration-time `SuiteContext` and `TestContext` types
- shared node registration, modifier metadata, hook storage, and `NodeIndex`
  derivation in the internal runtime
- a first internal executor that emits `NodeStart` / `NodePass`, runs normal
  node callbacks, and executes `beforeAll` / `beforeEach` in root-to-leaf
  order plus `afterEach` / `afterAll` in leaf-to-root order
- a first targeted `NodeIndex` lookup and `run()` export path that resolves a
  concrete node from the shared root tree and executes it through the internal
  executor
- a first root `discover()` export path that emits `NodeFound` for
  already-registered top-level nodes without turning discovery into node
  pass/fail classification
- a first staged discovery path by `NodeIndex`, currently surfaced through the
  wazero host `discover(nodeIndex)` helper, so hosts can request immediate
  child discovery under a known node and observe interruption as discovery
  failure instead of test outcome
- first declaration-mode discovery semantics for nested branches, where `skip`
  prunes descendant discovery while `todo` still allows descendant discovery

This is now beyond a declaration-only pass, but it is still an internal
runtime slice rather than a complete `node:test` runner. Targeted traversal,
full-depth `NodeFound` discovery, diagnostics, failure propagation, replay
validation, assertion-call accounting, and the remaining deferred `t.assert`
APIs remain open work.

## Current Explicit Non-Goal

Until AssemblyScript supports closures well enough to model mock callbacks and
per-call tracking coherently, this adapter should treat the following as
unsupported:

- top-level and context `mock` APIs
- `MockTracker`, `MockFunctionContext`, `MockPropertyContext`, `MockModuleContext`, and `MockTimers`
- assertion surfaces that depend on function-call recording rather than direct value checks

Until AssemblyScript also has Promise support strong enough to model async test
helpers coherently, this adapter should treat the following as unsupported:

- Promise-returning test or hook callbacks as a supported execution mode
- `t.assert.rejects(...)` and `t.assert.doesNotReject(...)`
- `t.waitFor(condition[, options])`
- any Promise-dependent helper layered on top of those APIs

## Investigated Surface

Baseline used for this inventory:

- official Node.js `test.html` docs for `v25.8.1`
- local runtime inspection against `node v25.8.0`

Observed top-level export keys from the local runtime:

- `test`
- `suite`
- `describe`
- `it`
- `before`
- `after`
- `beforeEach`
- `afterEach`
- `run`
- `mock`
- `snapshot`
- `assert`
- `only`
- `skip`
- `todo`
- `expectFailure`

Observed alias relationships in `v25.8.0`:

- `require('node:test') === require('node:test').test`
- `describe === suite`
- `it === test`
- `test` and `it` carry the same attached helper properties
- `suite` and `describe` carry the same attached helper properties

## Declaration Surface To Mirror

Top-level declaration functions:

- `test([name][, options][, fn])`
- `test.skip([name][, options][, fn])`
- `test.todo([name][, options][, fn])`
- `test.only([name][, options][, fn])`
- `suite([name][, options][, fn])`
- `suite.skip([name][, options][, fn])`
- `suite.todo([name][, options][, fn])`
- `suite.only([name][, options][, fn])`
- `describe([name][, options][, fn])`
- `describe.skip([name][, options][, fn])`
- `describe.todo([name][, options][, fn])`
- `describe.only([name][, options][, fn])`
- `it([name][, options][, fn])`
- `it.skip([name][, options][, fn])`
- `it.todo([name][, options][, fn])`
- `it.only([name][, options][, fn])`

Hook registration functions:

- `before([fn][, options])`
- `after([fn][, options])`
- `beforeEach([fn][, options])`
- `afterEach([fn][, options])`

Test and subtest options documented in Node `v25.8.1`:

- `concurrency`
- `expectFailure`
- `only`
- `signal`
- `skip`
- `todo`
- `timeout`
- `plan`

Important nuance:

- the docs describe `expectFailure` as a test/suite option and show `it.expectFailure(...)` examples
- the local `v25.8.0` runtime also exposes `expectFailure` as a top-level export and as a property on both `test`/`it` and `suite`/`describe`
- this shorthand should be treated as part of the observed runtime surface even though it does not currently have the same dedicated docs heading as `skip` / `todo` / `only`

## Non-Declaration Export Surface

These names exist on `node:test`, but they are not the first adapter target for the Wasm declaration layer:

- `run([options])`
- `assert.register(name, fn)`
- `snapshot.setDefaultSnapshotSerializers(serializers)`
- `snapshot.setResolveSnapshotPath(fn)`

Mocking classes and methods documented by Node:

- `MockTracker`
- `mock.fn([original[, implementation]][, options])`
- `mock.getter(object, methodName[, implementation][, options])`
- `mock.method(object, methodName[, implementation][, options])`
- `mock.module(specifier[, options])`
- `mock.property(object, propertyName[, value])`
- `mock.reset()`
- `mock.restoreAll()`
- `mock.setter(object, methodName[, implementation][, options])`

Mock helper contexts documented by Node:

- `MockFunctionContext`
- `ctx.calls`
- `ctx.callCount()`
- `ctx.mockImplementation(implementation)`
- `ctx.mockImplementationOnce(implementation[, onCall])`
- `ctx.resetCalls()`
- `ctx.restore()`
- `MockPropertyContext`
- `ctx.accesses`
- `ctx.accessCount()`
- `ctx.mockImplementation(value)`
- `ctx.mockImplementationOnce(value[, onAccess])`
- `ctx.resetAccesses()`
- `ctx.restore()`
- `MockModuleContext`
- `ctx.restore()`
- `MockTimers`
- `timers.enable([enableOptions])`
- `timers.reset()`
- `timers[Symbol.dispose]()`
- `timers.tick([milliseconds])`
- `timers.runAll()`
- `timers.setTime(milliseconds)`

Programmatic runner stream surface:

- `TestsStream`
- events: `test:coverage`, `test:complete`, `test:dequeue`, `test:diagnostic`, `test:enqueue`, `test:fail`, `test:interrupted`, `test:pass`, `test:plan`, `test:start`, `test:stderr`, `test:stdout`, `test:summary`, `test:watch:drained`, `test:watch:restarted`
- local runtime prototype members on the returned stream: `complete`, `coverage`, `dequeue`, `diagnostic`, `enqueue`, `fail`, `getSkip`, `getTodo`, `getXFail`, `interrupted`, `ok`, `plan`, `start`, `summary`

## Callback Context Surface

`SuiteContext` documented members:

- `context.filePath`
- `context.fullName`
- `context.name`
- `context.signal`

Observed `SuiteContext` prototype in `v25.8.0`:

- `filePath`
- `fullName`
- `name`
- `signal`

`TestContext` documented members:

- `context.before([fn][, options])`
- `context.beforeEach([fn][, options])`
- `context.after([fn][, options])`
- `context.afterEach([fn][, options])`
- `context.assert`
- `context.assert.fileSnapshot(value, path[, options])`
- `context.assert.snapshot(value[, options])`
- `context.diagnostic(message)`
- `context.filePath`
- `context.fullName`
- `context.name`
- `context.passed`
- `context.error`
- `context.attempt`
- `context.workerId`
- `context.plan(count[, options])`
- `context.runOnly(shouldRunOnlyTests)`
- `context.signal`
- `context.skip([message])`
- `context.todo([message])`
- `context.test([name][, options][, fn])`
- `context.waitFor(condition[, options])`

Observed `TestContext` prototype in `v25.8.0`:

- `after`
- `afterEach`
- `assert`
- `attempt`
- `before`
- `beforeEach`
- `diagnostic`
- `error`
- `filePath`
- `fullName`
- `mock`
- `name`
- `passed`
- `plan`
- `runOnly`
- `signal`
- `skip`
- `test`
- `todo`
- `waitFor`
- `workerId`

Observed `t.assert` members in `v25.8.0`:

- `ok`
- `equal`
- `notEqual`
- `deepEqual`
- `notDeepEqual`
- `strictEqual`
- `notStrictEqual`
- `deepStrictEqual`
- `notDeepStrictEqual`
- `partialDeepStrictEqual`
- `match`
- `doesNotMatch`
- `throws`
- `doesNotThrow`
- `rejects`
- `doesNotReject`
- `ifError`
- `fail`
- `snapshot`
- `fileSnapshot`

Important nuance:

- `t.assert` is a null-prototype object in the local runtime, not an `Assert` instance
- `t.plan(...)` only tracks assertion counts when the bound `t.assert.*` methods are used
- `t.mock` exists on `TestContext` and exposes the same tracker/timers surface shape as the top-level `mock`

## Adapter Scoping Notes

Likely first-pass declaration scope for the AssemblyScript adapter:

- `test`
- `suite`
- `describe`
- `it`
- `before`
- `after`
- `beforeEach`
- `afterEach`
- skip/todo/only/expect-failure declaration modes and options
- `TestContext.test(...)` for nested subtests
- `TestContext.skip(...)`
- `TestContext.todo(...)`

Likely later or host-oriented scope:

- `run()`
- `TestsStream`
- all mocking APIs
- snapshot configuration APIs
- dynamic `assert.register(...)`
- file-backed snapshot assertion helpers

## Required Functions

These are the adapter entry points that must exist for a useful first-pass
`node:test` implementation.

### Top-level declarations

- `test([name][, options][, fn])`
  Registers a runnable test node under the current structural scope.
- `it([name][, options][, fn])`
  Pure alias of `test`.
- `suite([name][, options][, fn])`
  Registers a structural container node whose callback declares descendants and
  may also execute during traversal.
- `describe([name][, options][, fn])`
  Pure alias of `suite`.

### Top-level modifiers

- `test.only(...)`
- `test.skip(...)`
- `test.todo(...)`
- `test.expectFailure(...)`
- `it.only(...)`
- `it.skip(...)`
- `it.todo(...)`
- `it.expectFailure(...)`
- `suite.only(...)`
- `suite.skip(...)`
- `suite.todo(...)`
- `suite.expectFailure(...)`
- `describe.only(...)`
- `describe.skip(...)`
- `describe.todo(...)`
- `describe.expectFailure(...)`

Each modifier is just a preconfigured declaration function. It should parse the
same overloads as the base function, then force the matching declaration option
before lowering into the shared registry.

### Hook registration

- `before([fn][, options])`
  Registers a `BeforeAll` hook on the current structural scope.
- `after([fn][, options])`
  Registers an `AfterAll` hook on the current structural scope.
- `beforeEach([fn][, options])`
  Registers a `BeforeEach` hook on the current structural scope.
- `afterEach([fn][, options])`
  Registers an `AfterEach` hook on the current structural scope.

### Test-context methods

- `t.test([name][, options][, fn])`
  Registers a nested subtest under the currently running test.
- `t.before([fn][, options])`
- `t.after([fn][, options])`
- `t.beforeEach([fn][, options])`
- `t.afterEach([fn][, options])`
  Context-scoped aliases for the same hook registration pipeline.
- `t.skip([message])`
  Stops the current test early and marks it skipped.
- `t.todo([message])`
  Marks the current test as todo at execution time.
- `t.diagnostic(message)`
  Emits a diagnostic event or records diagnostic text for host reporting.
- `t.plan(count[, options])`
  Stores the expected assertion count for the active test attempt.
- `t.runOnly(shouldRunOnlyTests)`
  Marks the active scope as filtered to `only` descendants.
- `t.waitFor(condition[, options])`
  Deferred for the first pass unless async polling is implemented.

### Suite-context properties

- `context.name`
- `context.fullName`
- `context.filePath`
- `context.signal`

These are read-only views over the currently executing suite node plus attempt
state.

### Test-context properties

- `t.name`
- `t.fullName`
- `t.filePath`
- `t.signal`
- `t.passed`
- `t.error`
- `t.attempt`
- `t.workerId`
- `t.assert`
- `t.mock`

For the first pass, `t.mock` can remain unimplemented and omitted from the
adapter if the goal is declaration/traversal compatibility first. `t.assert`
needs to exist once the shared assertion bridge exists, because `t.plan(...)`
depends on assertion-call accounting.

## Required Types

These are the user-facing and internal types the adapter needs in order to
implement the function surface above.

### User-facing callback shapes

- `type TestFn = (t: TestContext) => void`
  Runnable callback for `test` / `it`.
- `type SuiteFn = (s: SuiteContext) => void`
  Structural callback for `suite` / `describe`.
- `type HookFn = (t: TestContext) => void`
  Runnable lifecycle callback.

If async support is deferred, keep these callbacks synchronous in the initial
AssemblyScript adapter.

### User-facing option shapes

- `interface TestOptions`
  Needs fields for `skip`, `todo`, `only`, `expectFailure`, `timeout`,
  `concurrency`, `signal`, and `plan`.
- `interface SuiteOptions`
  Same shape as `TestOptions`, minus any fields that are only meaningful for a
  runnable leaf in the first pass.
- `interface HookOptions`
  Needs at least `timeout` and `signal`.
- `interface WaitForOptions`
  Needed only if `t.waitFor(...)` is implemented in the first pass.

### Normalized internal declaration data

- `type NormalizedName = string`
  The adapter should decide one stable fallback for omitted names.
- `interface NormalizedDeclaration`
  Contains `kind`, `name`, `mode`, `only`, `expectFailure`, `timeout`,
  `concurrency`, `signal`, `plan`, and `callback`.
- `interface NormalizedHookRegistration`
  Contains `hookKind`, `timeout`, `signal`, `callback`, and owning scope.

These types are the critical seam between overload parsing and the shared
registry/traversal runtime.

### Runtime metadata types

- `interface NodeExecutionOptions`
  Durable per-node options needed at replay time.
- `interface HookRegistration`
  Concrete registered lifecycle callback plus metadata.
- `class TestContext`
  Ephemeral execution object for runnable tests and hooks.
- `class SuiteContext`
  Ephemeral execution object for suites.
- `class AssertionFacade`
  Null-prototype assertion namespace attached to `t.assert`.

### Shared-runtime extensions needed beyond the current code

- extend `NodeKind` if more structural kinds become necessary later
- keep `DeclarationMode` for `Normal`, `Skip`, and `Todo`
- add durable node flags for `only` and `expectFailure`
- add a hook-storage type on `Node`
- add a helper type for the active execution frame
- add a helper type for targeted traversal input, based on `NodeIndex`

## Proposed Implementation

The clean implementation is a thin adapter over new shared runtime layers, not a
large monolithic `node:test` file.

### 1. Keep the adapter tiny

Add `assembly/assembly/node:test/index.ts` as the public `--lib` entry point and
keep it limited to:

- exported aliases: `test`, `it`, `suite`, `describe`
- attached modifiers: `.only`, `.skip`, `.todo`, `.expectFailure`
- exported hooks: `before`, `after`, `beforeEach`, `afterEach`
- overload parsing and normalization

Everything after normalization should call shared internal helpers.

### 2. Extend `Node` instead of replacing it

The existing [`internal/node.ts`](/home/jtenner/Projects/as-harness/assembly/assembly/internal/node.ts)
already gives the right structural base: parent linkage, deterministic child
ordinals, and lazy rediscovery through the declaration callback.

Extend it with:

- durable execution options: `only`, `expectFailure`, `timeout`, `concurrency`,
  `plan`
- hook lists keyed by `HookKind`
- a stable helper for computing `NodeIndex` from the parent chain
- optional file-path metadata if the adapter wants to expose `context.filePath`

Do not move hook registration into a separate graph object unless the current
`Node` shape becomes a blocker; the parent-owned structure is already the right
ownership model.

### 3. Add a declaration normalizer

Create a small shared helper, for example `internal/api.ts`, that:

- parses `(name?, options?, fn?)` overloads
- applies modifier-forced options
- chooses a stable default name
- converts the overload result into `NormalizedDeclaration`

This avoids duplicating parsing logic across `test`, `suite`, `describe`, and
their modifier variants.

### 4. Register through one path

Create one shared declaration helper:

- `declareNode(kind: NodeKind, declaration: NormalizedDeclaration): Node`

It should:

- resolve the active structural parent from `currentNode`
- convert `skip` / `todo` into `DeclarationMode`
- attach durable flags such as `only` and `expectFailure`
- store the original callback for replay-time rediscovery and execution

This should be the only path used by `test`, `suite`, `describe`, `it`, and
`t.test(...)`.

### 5. Add hook registration to the shared runtime

Create a shared helper such as:

- `registerHook(hookKind: HookKind, registration: NormalizedHookRegistration): void`

It should:

- attach the hook to the current structural node
- preserve registration order
- keep hook callbacks outside the child-node ordinal space

That separation matters because hooks affect execution order but are not
structural descendants.

### 6. Build ephemeral contexts at execution time

Create `TestContext` and `SuiteContext` as execution-frame views, not durable
registry objects.

`SuiteContext` should expose:

- metadata getters
- `signal`

`TestContext` should expose:

- metadata getters
- nested declaration methods
- hook registration methods
- skip/todo/diagnostic/plan/runOnly methods
- `assert`

The context should be rebuilt per attempt so mutable execution state does not
leak across host-driven replays.

### 7. Split discovery from execution

Use the current lazy callback model in two distinct modes:

- discovery mode: evaluate declaration callbacks only to re-register children
- execution mode: run the node callback as a runnable unit and emit
  `NodeStart` / `NodePass`

This distinction is important because `describe`-style callbacks do both:

- they define structure
- they may run hooks and nested declarations during traversal

The runtime needs an explicit attempt-local execution frame so nested
declarations attach to the active traversal scope rather than to stale
registration state.

### 8. Implement hook ordering explicitly

Add one shared executor path that can run:

- inherited `beforeAll`
- inherited `beforeEach`
- node callback
- inherited `afterEach`
- inherited `afterAll`

The exact ordering rules should be encoded in one place, with callback events
emitted through [`internal/events.ts`](/home/jtenner/Projects/as-harness/assembly/assembly/internal/events.ts).

### 9. Treat `only` and `expectFailure` as metadata, not modes

Do not overload `DeclarationMode` with more enum members.

Instead:

- keep `DeclarationMode` for structural traversal semantics only
- store `only` as a scheduler/filter flag
- store `expectFailure` as a host-visible execution expectation flag

That matches their semantics better and avoids polluting the skip/todo traversal
logic.

### 10. Defer non-core `node:test` features cleanly

For the first implementation, explicitly defer:

- `run()`
- `TestsStream`
- `mock`
- `snapshot`
- `assert.register(...)`
- `t.waitFor(...)`
- file-backed snapshot assertions

Expose no-op placeholders only if the AssemblyScript compiler requires the names
to exist. Otherwise keep them out until there is host/runtime support.

## Recommended File Layout

- `assembly/assembly/node:test/index.ts`
  Public exports and alias wiring.
- `assembly/assembly/node:test/types.ts`
  User-facing option and context declarations.
- `assembly/assembly/node:test/parse.ts`
  Overload parsing and modifier normalization.
- `assembly/assembly/internal/api.ts`
  Shared declaration and hook registration helpers.
- `assembly/assembly/internal/context.ts`
  `TestContext`, `SuiteContext`, and execution-frame state.
- `assembly/assembly/internal/hooks.ts`
  Hook storage plus execution ordering.
- `assembly/assembly/internal/traversal.ts`
  Replay, discovery, and targeted execution.

## Recommended Order

1. Implement overload parsing plus `test` / `suite` declaration registration.
2. Add aliases `it` and `describe`.
3. Add `.skip`, `.todo`, `.only`, and `.expectFailure`.
4. Add hook registration storage.
5. Add `TestContext.test(...)`, `t.skip(...)`, and `t.todo(...)`.
6. Add hook execution ordering and callback events.
7. Bind `t.assert` onto the completed `node:assert` bridge surface.
8. Add `t.plan(...)` only after assertion-call accounting exists.

- [x] Define the `node:test` declaration surface to expose from this `--lib` entry point.
- [x] Map `test`, `describe`, `skip`, `todo`, and lifecycle APIs onto the shared internal declarations.
- [x] Keep adapter-specific overloads and naming inside this folder.
- [x] Add initial source files and a minimal traversal fixture.
