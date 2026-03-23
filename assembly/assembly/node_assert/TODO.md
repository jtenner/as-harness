# `node:assert` Adapter TODO

Status: shipped bridge surface kept intentionally narrow.

Repository policy note as of 2026-03-23: adapter work in `assembly/` remains repo-internal rather than a separately published npm package. Public installation is npm-only via `@as-harness/cli`, which expects a consumer-installed `assemblyscript` peer.

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
