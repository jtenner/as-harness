# `uvu` Adapter TODO

Status: full runner surface remains deferred; low-risk `uvu/assert` subset is shipped.

Shipped:

- `uvu/assert`: `ok`, `is`, `equal`, `not`, `is.not`, `not.equal`,
  `unreachable`

Remaining:

- minimum `suite(...)` / top-level `test` runner surface
- explicit `.run()` compatibility policy
- hook-builder mapping into the shared runtime

Constraint: keep logic in shared runtime, no runtime-policy duplication in adapter.
