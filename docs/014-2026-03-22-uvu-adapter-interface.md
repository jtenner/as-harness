# uvu Adapter Interface

This note answers what `uvu` and `uvu/assert` support is now shipped in
`as-harness`, what the exact exported contract is, where it intentionally
diverges from upstream `uvu`, and which remaining compatibility gaps are still
worth tracking across `assembly/`, `cli/`, and `harness/`. The current
recommendation is now explicit: keep the shipped sync `uvu` builder contract as
the permanent source shape, add host-readable orchestration hints on top of
that builder surface in this cycle, and defer any attempt at strict upstream
call-signature compatibility until the project is willing to add a transform or
some broader source-rewrite policy.

## Research Basis

Checked on 2026-03-22 against:

- `uvu@0.5.6` package metadata
- published `index.d.ts`
- published `assert/index.d.ts`
- published `dist/index.mjs`
- published `assert/index.mjs`
- the package README
- current `as-harness` runtime and shipped adapter code

## Current Repo Recommendation

- keep the shipped sync `uvu` slice as the supported contract
- freeze the builder-object divergence as the permanent contract unless the
  repo later adopts a source transform
- keep `.run()` as an explicit compatibility no-op under host-owned `start()`
- ship host-readable `inBand(...)`, `bail(...)`, and
  `continueOnFailure(...)` hint APIs on the `uvu` singleton and suite builder
  surfaces
- ship `exec(true)` as a root-level `bail` hint declaration and `exec(false)`
  as an explicit revert to inherited failure policy
- keep the shared `TestContext` callback model instead of promising upstream
  crumb/context parity
- keep `uvu/assert` on the low-risk shared assertion subset
- do not claim full upstream source compatibility because AssemblyScript cannot
  model a callable object with attached methods the way upstream `suite()`
  expects

## Shipped Public Shape

Current import shape:

```ts
import { exec, suite, test, TestContext, UvuSuite } from "uvu";
import {
  equal,
  is,
  not,
  ok,
  throws,
  type,
  unreachable,
} from "uvu/assert";
```

### Top-Level `test`

Shipped:

- `test(name, callback)`
- `test.only(name, callback)`
- `test.skip(name?, callback?)`
- `test.inBand(shouldRunInBand?)`
- `test.bail(shouldBail?)`
- `test.continueOnFailure(shouldContinue?)`
- `test.before(hook)`
- `test.before.each(hook)`
- `test.after(hook)`
- `test.after.each(hook)`
- `test.run()`

Behavior:

- top-level hook registration maps directly into the shared root hook tree
- top-level hint helpers lower to shared root-level host-owned planning hints
- `test.run()` is a compatibility no-op
- callbacks receive shared `TestContext`

### `suite(...)`

Shipped shape:

```ts
export function suite<T = usize>(
  name?: string,
  context?: T,
): UvuSuite<T>;
```

Shipped builder methods:

- `.test(name, callback)`
- `.only(name, callback)`
- `.skip(name?, callback?)`
- `.inBand(shouldRunInBand?)`
- `.bail(shouldBail?)`
- `.continueOnFailure(shouldContinue?)`
- `.before(hook)`
- `.after(hook)`
- `.beforeEach(hook)`
- `.afterEach(hook)`
- `.run()`
- `.name`
- `.context`

Behavior:

- `suite(...)` creates a real suite node in the shared declaration tree
- builder methods temporarily register children and hooks against that suite
  node
- suite hint helpers lower to shared suite-local host-owned planning hints
- `.run()` is a compatibility no-op
- `.context` stores the supplied suite-local payload for user code that wants
  to keep explicit state near the builder
- callbacks still receive shared `TestContext`, not upstream crumb/context
  objects

### `exec(...)`

Shipped:

- `exec(bail?)`

Behavior:

- `exec(true)` lowers to a root-level shared `bail` hint
- `exec(false)` explicitly restores inherited failure policy on the root scope
- execution still remains fully host-owned and `exec(...)` does not start work

### `uvu/assert`

Shipped:

- `ok`
- `is`
- `equal`
- `type`
- `throws`
- `not`
- `is.not`
- `not.equal`
- `not.type`
- `not.throws`
- `unreachable`

Mappings:

- `ok` -> shared truthy assertion
- `is` -> strict equality
- `equal` -> deep strict equality
- `type` -> shared primitive-type comparison on the current AssemblyScript value category
- `throws` -> shared trap-boundary throw assertion
- `not` / `is.not` -> strict inequality
- `not.equal` -> deep strict inequality
- `not.type` -> negated shared primitive-type comparison
- `not.throws` -> shared trap-boundary does-not-throw assertion
- `unreachable` -> shared `fail(...)`

## Exact Compatibility Differences

### 1. `suite()` Is Not A Callable Returned Object

Upstream `uvu` returns a callable object:

- `const math = suite("math");`
- `math("adds", fn);`
- `math.before.each(fn);`

The shipped `as-harness` contract cannot do that exactly because current
AssemblyScript cannot represent a callable object with attached methods in a
way that preserves upstream source shape.

Shipped replacement:

```ts
const math = suite("math");
math.test("adds", (context: TestContext): void => {});
math.beforeEach((context: TestContext): void => {});
math.run();
```

Recommendation:

- document this as an intentional divergence, not as hidden emulation

### 2. Callback Context Is `TestContext`, Not Upstream Crumbs

Upstream `uvu` callbacks receive a context object that may include:

- `__suite__`
- `__test__`

Shipped `as-harness` callbacks receive:

- shared `TestContext`

Reason:

- it reuses the already-shipped diagnostics and assertion bridge
- it avoids introducing a one-off callback-shape contract in only one adapter

### 3. `.before.each` / `.after.each` Are Exact Only On Top-Level `test`

The shipped top-level singleton supports:

- `test.before.each(...)`
- `test.after.each(...)`

The shipped suite-builder methods use:

- `.beforeEach(...)`
- `.afterEach(...)`

Reason:

- the callable-object limitation also blocks method-namespace parity on the
  returned builder object

### 4. `exec(bail?)` And `.run()` Do Not Start Execution

They do not start execution because:

- the host owns execution through `start()`
- guest-side runner control would create overlapping orchestration surfaces

Current policy:

- `.run()` remains a compatibility no-op
- `exec(...)` may declare host-readable hints, but it still does not start
  execution

### 5. Async Is Still Unsupported

Deferred:

- Promise-returning tests
- Promise-returning hooks
- upstream async `exec()` behavior

## Function-By-Function Status

### `test(name, callback)`

Status: Shipped.

Game plan used:

- map directly to shared test declaration registration

### `test.only(name, callback)`

Status: Shipped.

Game plan used:

- map to shared `only = true` metadata

### `test.skip(name?, callback?)`

Status: Shipped.

Game plan used:

- map to skipped declaration mode

Compatibility note:

- when `only` filtering is active within the same scope, skipped siblings are
  filtered out by the shared traversal rules just like other non-`only`
  siblings

### `test.before(hook)` / `test.after(hook)`

Status: Shipped.

Game plan used:

- map to root `beforeAll` / `afterAll`

### `test.before.each(hook)` / `test.after.each(hook)`

Status: Shipped.

Game plan used:

- map to root `beforeEach` / `afterEach`

### `test.run()`

Status: Shipped as no-op.

### `test.inBand(shouldRunInBand?)`

Status: Shipped.

Game plan:

- lower onto the shared root-level `preferredRunnerMode` hint
- keep the API declarative only; it must not change execution immediately

### `test.bail(shouldBail?)`

Status: Shipped.

Game plan:

- lower onto the shared root-level `preferredFailurePolicy` hint
- treat `false` as restore-to-inherit rather than as guest-owned scheduler
  control

### `test.continueOnFailure(shouldContinue?)`

Status: Shipped.

Game plan:

- lower onto the shared root-level explicit continue policy so nested suites can
  override an inherited `bail`

### `suite(name?, context?)`

Status: Shipped with documented divergence.

Game plan used:

- create a suite node immediately
- return a suite-builder object that can register tests and hooks onto that
  node
- keep the supplied context payload on the builder as `.context`

### `UvuSuite.test(name, callback)`

Status: Shipped.

Game plan used:

- temporarily switch the active declaration node to the suite node
- register a normal child test

### `UvuSuite.only(name, callback)`

Status: Shipped.

Game plan used:

- same as `.test(...)`, but set shared `only = true`

### `UvuSuite.skip(name?, callback?)`

Status: Shipped.

Game plan used:

- same as `.test(...)`, but set skipped declaration mode

### `UvuSuite.inBand(shouldRunInBand?)`

Status: Shipped.

Game plan:

- set shared suite-local `preferredRunnerMode`
- let descendants inherit that hint through the host planner

### `UvuSuite.bail(shouldBail?)`

Status: Shipped.

Game plan:

- set shared suite-local `preferredFailurePolicy = bail`
- rely on the host planner's nearest-scope bail semantics

### `UvuSuite.continueOnFailure(shouldContinue?)`

Status: Shipped.

Game plan:

- set shared suite-local explicit continue policy
- use it to opt out of an inherited enclosing `bail`

### `UvuSuite.before(hook)` / `UvuSuite.after(hook)`

Status: Shipped.

Game plan used:

- temporarily switch the active declaration node and register suite-local
  `beforeAll` / `afterAll`

### `UvuSuite.beforeEach(hook)` / `UvuSuite.afterEach(hook)`

Status: Shipped.

Game plan used:

- temporarily switch the active declaration node and register suite-local
  `beforeEach` / `afterEach`

### `UvuSuite.run()`

Status: Shipped as no-op.

### `exec(bail?)`

Status: Shipped.

Game plan:

- `exec(true)` sets the shared root-level `bail` hint
- `exec(false)` restores inherited failure policy
- keep execution host-owned and do not let `exec(...)` trigger scheduling

### `uvu/assert`

Status: Partially shipped.

Shipped:

- `ok`
- `is`
- `equal`
- `type`
- `throws`
- `not`
- `is.not`
- `not.equal`
- `not.type`
- `not.throws`
- `unreachable`

Deferred:

- `instance`
- `snapshot`
- `fixture`
- `match`
- negated forms that depend on those helpers
- `Assertion`

## Primary Remaining Blockers

### 1. Callable Suite Objects

Decision:

- freeze the shipped builder-object divergence as the permanent `uvu` contract
  for now

Reason:

- the project now prefers spending compatibility budget on host-readable hint
  lowering and richer assertion support rather than on a transform-backed
  callable-suite emulation layer

### 2. Crumb/Context Callback Parity

Matching upstream `__suite__` / `__test__` crumbs would require either:

- a new adapter-local callback context type
- or a broader shared callback-model decision across adapters

### 3. Async Runner Semantics

The repo still does not support:

- Promise hooks
- Promise tests
- guest-owned execution finalization

### 4. Remaining `uvu/assert` Helpers Need Contracts The Repo Does Not Ship

The remaining helpers now split into three deferred contract families:

- constructor-aware checks like `instance(...)`, which need a stable guest
  constructor-token story before they can be documented honestly
- matcher-style and partial-match helpers like `match(...)`, which would
  otherwise duplicate logic outside the shared assertion core
- artifact-backed helpers like `snapshot(...)` and `fixture(...)`, which need a
  host-backed file or persisted-artifact contract that the current guest ABI
  does not expose

`Assertion` stays deferred with that set because it depends on a richer
upstream-specific error object model than the shared trap and fail-message
boundary currently provides.

## Selected This Cycle

1. keep the current builder contract as the permanent `uvu` source shape
2. ship host-readable `inBand(...)`, `bail(...)`, and
   `continueOnFailure(...)` helpers on top-level `test` and `UvuSuite`
3. ship `exec(bail?)` as root-level `bail` hint lowering only
4. keep `.run()` as a compatibility no-op
5. explicitly defer the remaining `uvu/assert` helper families for this cycle

## Suggested Future Order

1. revisit crumb/context parity only if the callback-model divergence becomes a
   practical blocker
2. revisit richer `uvu/assert` helpers only after the repo adopts either a
   constructor-token contract, a shared partial-match assertion core, or a
   host-backed artifact model
3. keep async behavior deferred until the project-wide runtime contract changes

## Sources

- `uvu` package metadata (`0.5.6`): https://unpkg.com/uvu@0.5.6/package.json
- README: https://unpkg.com/uvu@0.5.6/readme.md
- `index.d.ts`: https://unpkg.com/uvu@0.5.6/index.d.ts
- `assert/index.d.ts`: https://unpkg.com/uvu@0.5.6/assert/index.d.ts
- `dist/index.mjs`: https://unpkg.com/uvu@0.5.6/dist/index.mjs
- `assert/index.mjs`: https://unpkg.com/uvu@0.5.6/assert/index.mjs
