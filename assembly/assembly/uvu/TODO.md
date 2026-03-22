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
  `not`, `is.not`, `not.equal`, `not.match`, `not.type`, `not.instance`,
  `not.throws`, and `unreachable`

Deferred this cycle:

- strict upstream callable-suite source compatibility
- upstream crumb/context callback parity
- async hooks/tests
- artifact-backed `uvu/assert` `snapshot(...)` and `fixture(...)`
- upstream `Assertion` object parity

Constraint: keep logic in shared runtime, no runtime-policy duplication in adapter.
