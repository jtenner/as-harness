# `mocha` Adapter TODO

Status: declaration surface implemented for the current `v0.4.0` line.

Implemented:

- BDD declarations: `describe`, `context`, `it`, `specify`
- `only`, `skip`, and `x*` aliases
- `before`, `after`, `beforeEach`, `afterEach`
- callback-less pending tests
- bundled CLI wiring and JS-host smoke proof

Remaining:

- keep async `done`, returned `Promise`, and callback `this` APIs out of scope
- extend proof beyond bundled JS-host smoke into the remaining host matrix
- keep assertion guidance on shared `node:assert` and optional `TestContext`
