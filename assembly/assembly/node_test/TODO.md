# `node:test` Adapter TODO

Status:

- active
- in scope for `v0.1.0`

Implemented scope:

- synchronous top-level `test`, `it`, `suite`, and `describe`
- declaration modifiers such as `skip`, `todo`, `only`, and `expectFailure`
- chainable returned test declarations for explicit dependency edges
- top-level lifecycle hooks
- first `TestContext` and `SuiteContext` surface
- targeted `run()` and first `discover()` flows
- `t.assert` bound to the current synchronous `node:assert` bridge

Still deferred:

- Promise-based tests and hooks
- mock APIs
- programmatic runner streams
- snapshots
- fuller replay and traversal semantics beyond the current shipped slice
- richer worker and timeout controls

Next work:

- keep the synchronous core stable
- finish the remaining host-facing notes for traversal and replay
- keep the adapter thin over the shared guest runtime
