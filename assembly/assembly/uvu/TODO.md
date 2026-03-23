# `uvu` Adapter TODO

Status: shipped sync `uvu` slice with top-level `test` hooks, `suite(...)`
builder objects, `.run()` / `exec()` no-op compatibility, and the shared
`uvu/assert` subset.

Shipped:

- `uvu`: top-level `test(...)`, `test.only(...)`, `test.skip(...)`,
  `test.inBand(...)`, `test.bail(...)`, `test.continueOnFailure(...)`,
  `test.before(...)`, `test.before.each(...)`, `test.after(...)`,
  `test.after.each(...)`, `test.run()`, `suite(...)`, suite-builder
  `.test(...)`, `.only(...)`, `.skip(...)`, `.inBand(...)`, `.bail(...)`,
  `.continueOnFailure(...)`, `.before(...)`, `.after(...)`, `.beforeEach(...)`,
  `.afterEach(...)`, and `exec(...)`
- `uvu/assert`: `ok`, `is`, `equal`, `match`, `type`, `instance`, `throws`,
  `snapshot`, `fixture`, `not`, `is.not`, `not.equal`, `not.match`,
  `not.type`, `not.instance`, `not.throws`, and `unreachable`
- `uvu` callbacks now receive adapter-local `TestContext` crumbs with
  `__suite__` and `__test__` while keeping the shared assertion and diagnostic
  surface

Deferred this cycle:

- strict upstream callable-suite source compatibility
- async hooks/tests until AssemblyScript adds meaningful async support
- upstream `Assertion` object parity

Permanent divergence for now:

- returned callable `suite()` source compatibility stays frozen behind the
  shipped builder-object contract unless the repo adopts a transform-backed
  rewrite policy later

Constraint: keep logic in shared runtime, no runtime-policy duplication in adapter.
