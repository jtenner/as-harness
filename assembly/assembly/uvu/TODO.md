# `uvu` Adapter TODO

Status: shipped sync `uvu` slice with top-level `test` hooks, `suite(...)`
builder objects, `.run()` / `exec()` no-op compatibility, and the shared
`uvu/assert` surface.

Shipped:

- `uvu`: top-level `test(...)`, `test.only(...)`, `test.skip(...)`,
  `test.inBand(...)`, `test.bail(...)`, `test.continueOnFailure(...)`,
  `test.before(...)`, `test.before.each(...)`, `test.after(...)`,
  `test.after.each(...)`, `test.run()`, `suite(...)`, suite-builder
  `.test(...)`, `.only(...)`, `.skip(...)`, `.inBand(...)`, `.bail(...)`,
  `.continueOnFailure(...)`, `.before(...)`, `.after(...)`, `.beforeEach(...)`,
  `.afterEach(...)`, and `exec(...)`
- `uvu/assert`: `Assertion`, `ok`, `is`, `equal`, `match`, `type`, `instance`,
  `throws`, `snapshot`, `fixture`, `not`, `is.not`, `not.equal`, `not.match`,
  `not.type`, `not.instance`, `not.throws`, and `unreachable`
- `uvu` callbacks now receive adapter-local `TestContext` crumbs with
  `__suite__` and `__test__` while keeping the shared assertion and diagnostic
  surface

Deferred after this parity work:

- strict upstream callable-suite source compatibility
- async hooks/tests until AssemblyScript adds meaningful async support

Permanent divergence for now:

- returned callable `suite()` source compatibility stays frozen behind the
  shipped builder-object contract unless the repo adopts a transform-backed
  rewrite policy later
- upstream `Assertion.actual` and `Assertion.expects` value payloads are stored
  as reflected render strings rather than arbitrary JS objects, because the
  current Wasm trap boundary cannot preserve rich thrown object identity across
  guest-side trap observation yet
- the repo-local artifact-backed `snapshot(...)` and `fixture(...)` helpers do
  not currently claim upstream negated helper parity such as `not.snapshot(...)`
  or `not.fixture(...)`

Constraint: keep logic in shared runtime, no runtime-policy duplication in adapter.
