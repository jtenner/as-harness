# `node:assert` Adapter TODO

Status:

- active
- in scope for `v0.1.0`

Implemented scope:

- synchronous `node:assert`
- synchronous `node:assert/strict`
- strict structural comparison core through the current guest runtime and transform support
- reuse through `node:test` via `t.assert`

Still deferred:

- Promise-based assertion helpers
- matcher-aware throw APIs
- legacy loose deep-equality follow-through beyond the current first scope
- richer object-model classes such as `Assert` and `AssertionError`

Next work:

- keep the current bridge stable
- improve reflected diagnostics and fixtures
- avoid growing a second assertion runtime inside `node:test`
