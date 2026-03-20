# `node:assert` Adapter TODO

Status: active, in scope for `v0.1.0`.

Implemented:

- sync `node:assert`
- sync `node:assert/strict`
- strict structural comparison via shared runtime
- shared `t.assert` integration through `node:test`

Still deferred:

- Promise-based helpers
- matcher-aware throw APIs
- loose deep equality and `AssertionError` object surface

Next:

- strengthen reflected diagnostics and fixtures
- avoid adding a second assertion runtime under `node:test`
