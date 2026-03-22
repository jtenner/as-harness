# `uvu` Adapter TODO

Status: shipped sync `uvu` slice with top-level `test` hooks, `suite(...)`
builder objects, `.run()` / `exec()` no-op compatibility, and the shared
`uvu/assert` subset.

Shipped:

- `uvu`: top-level `test(...)`, `test.only(...)`, `test.skip(...)`,
  `test.before(...)`, `test.before.each(...)`, `test.after(...)`,
  `test.after.each(...)`, `test.run()`, `suite(...)`, suite-builder
  `.test(...)`, `.only(...)`, `.skip(...)`, `.before(...)`, `.after(...)`,
  `.beforeEach(...)`, `.afterEach(...)`, and `exec(...)`
- `uvu/assert`: `ok`, `is`, `equal`, `not`, `is.not`, `not.equal`,
  `unreachable`

Remaining:

- strict upstream callable-suite source compatibility
- upstream crumb/context callback parity
- async hooks/tests and richer `uvu/assert` helpers such as `throws(...)`,
  `match(...)`, and constructor-aware checks

Constraint: keep logic in shared runtime, no runtime-policy duplication in adapter.
