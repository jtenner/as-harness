# uvu Adapter Interface

This note answers what `uvu` and `uvu/assert` support is now shipped in
`as-harness`, what the exact exported contract is, where it intentionally
diverges from upstream `uvu`, and which remaining compatibility gaps are still
worth tracking across `assembly/`, `cli/`, and `harness/`. The recommendation
after implementation is to keep the shipped sync `uvu` slice, document the
callable-suite divergence plainly, and defer any attempt at strict upstream
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
- treat `.run()` and `exec()` as explicit compatibility no-ops under
  host-owned `start()`
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
import { equal, is, not, ok, unreachable } from "uvu/assert";
```

### Top-Level `test`

Shipped:

- `test(name, callback)`
- `test.only(name, callback)`
- `test.skip(name?, callback?)`
- `test.before(hook)`
- `test.before.each(hook)`
- `test.after(hook)`
- `test.after.each(hook)`
- `test.run()`

Behavior:

- top-level hook registration maps directly into the shared root hook tree
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
- `.run()` is a compatibility no-op
- `.context` stores the supplied suite-local payload for user code that wants
  to keep explicit state near the builder
- callbacks still receive shared `TestContext`, not upstream crumb/context
  objects

### `exec(...)`

Shipped:

- `exec(bail?)`

Behavior:

- compatibility no-op
- the `bail` flag is accepted but ignored

### `uvu/assert`

Shipped:

- `ok`
- `is`
- `equal`
- `not`
- `is.not`
- `not.equal`
- `unreachable`

Mappings:

- `ok` -> shared truthy assertion
- `is` -> strict equality
- `equal` -> deep strict equality
- `not` / `is.not` -> strict inequality
- `not.equal` -> deep strict inequality
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

They are explicit no-ops because:

- the host owns execution through `start()`
- guest-side runner control would create overlapping orchestration surfaces

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

Status: Shipped as no-op.

### `uvu/assert`

Status: Partially shipped.

Shipped:

- `ok`
- `is`
- `equal`
- `not`
- `is.not`
- `not.equal`
- `unreachable`

Deferred:

- `type`
- `instance`
- `snapshot`
- `fixture`
- `match`
- `throws`
- negated forms that depend on those helpers
- `Assertion`

## Primary Remaining Blockers

### 1. Callable Suite Objects

The remaining strict source-compatibility gap is the inability to represent the
upstream returned callable object cleanly in AssemblyScript source.

If revisited later, realistic options are:

1. add a source transform that rewrites upstream `suite()` usage into the
   shipped builder form
2. keep the current builder divergence and stop aiming at exact upstream source
   parity

### 2. Crumb/Context Callback Parity

Matching upstream `__suite__` / `__test__` crumbs would require either:

- a new adapter-local callback context type
- or a broader shared callback-model decision across adapters

### 3. Async Runner Semantics

The repo still does not support:

- Promise hooks
- Promise tests
- guest-owned execution finalization

### 4. Rich `uvu/assert` Error Matching

Helpers like `throws`, `match`, and constructor-aware checks still do not fit
the current failure boundary cleanly.

## Suggested Future Order

1. decide whether exact callable-suite source compatibility is worth a transform
2. if yes, prototype rewrite-based `suite()` call-shape preservation
3. if not, freeze the current builder contract as the permanent `uvu` policy
4. revisit crumb/context parity only after that decision
5. keep async and richer `uvu/assert` helpers deferred until the project-wide
   runtime contract changes

## Sources

- `uvu` package metadata (`0.5.6`): https://unpkg.com/uvu@0.5.6/package.json
- README: https://unpkg.com/uvu@0.5.6/readme.md
- `index.d.ts`: https://unpkg.com/uvu@0.5.6/index.d.ts
- `assert/index.d.ts`: https://unpkg.com/uvu@0.5.6/assert/index.d.ts
- `dist/index.mjs`: https://unpkg.com/uvu@0.5.6/dist/index.mjs
- `assert/index.mjs`: https://unpkg.com/uvu@0.5.6/assert/index.mjs
