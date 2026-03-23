# `node:test` Adapter TODO

Status: shipped synchronous core kept intentionally narrow.

Repository policy note as of 2026-03-23: adapter work in `assembly/` remains repo-internal rather than a separately published npm package. Public installation is npm-only via `@as-harness/cli`, which expects a consumer-installed `assemblyscript` peer.

Implemented:

- synchronous top-level `test` / `it` / `suite` / `describe`
- `skip`, `todo`, `only`, `expectFailure`
- chainable declaration handles (`dependsOn`)
- lifecycle hooks and smoke flow
- `node:test` context APIs
- targeted `run()` and basic `discover()`
- `node:test` assertion bridge via `node.assert`

Still deferred:

- async APIs, mock APIs, snapshots
- richer runner streams
- deeper replay and traversal semantics
- full worker/timeout controls

Next:

- keep synchronous core stable
- finish traversal/replay notes
- keep adapter thin over shared runtime
