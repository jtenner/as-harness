# `as-harness` Adapter TODO

Status: shipped native surface for the current `v0.4.0` line.

Implemented:

- native scheduler-aware declarations via `test`, `it`, `describe`, and `suite`
- chainable `TestDeclarationHandle.dependsOn(...)`
- sequential metadata through `sequential(...)`, `test.sequential(...)`, and suite aliases
- core lifecycle hooks via `beforeAll`, `afterAll`, `beforeEach`, and `afterEach`

Still deferred:

- async APIs, mocks, retries, and timeout enforcement
- richer assertion sugar beyond the shared `TestContext.assert` bridge
- adapter-specific scheduling logic outside shared metadata

Next:

- keep the native surface thin over shared planner metadata
- expand proof only when the shared scheduler contract changes
