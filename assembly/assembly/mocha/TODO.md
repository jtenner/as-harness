# `mocha` Adapter TODO

Status: thin adapter shipped for the current `v0.4.0` line.

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
