# `mocha` Adapter TODO

Status: thin adapter shipped for the current `v0.4.0` line.

Repository policy note as of 2026-03-23: adapter work in `assembly/` remains repo-internal rather than a separately published npm package. Public installation is npm-only via `@as-harness/cli`, which expects a consumer-installed `assemblyscript` peer.

Implemented:

- BDD declarations: `describe`, `context`, `it`, `specify`
- `only`, `skip`, and `x*` aliases
- `before`, `after`, `beforeEach`, `afterEach`
- callback-less pending tests
- bundled CLI wiring and cross-host proof through `js`, `wazero`, and
  `wasmtime`

Current non-goals:

- async `done`, returned `Promise`, and callback `this` APIs
- chainable declaration modifiers such as `.timeout(...)`
- bundled Chai parity beyond shared `node:assert` and optional `TestContext`
