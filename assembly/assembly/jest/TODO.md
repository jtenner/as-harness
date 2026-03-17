# `jest` Adapter TODO

Status:

- first declaration slice implemented
- not in `v0.1.0`

First implementation slice:

- [x] map `test`, `describe`, `skip`, `todo`, and core lifecycle hooks
- [x] keep Jest-specific overloads inside this folder
- [x] add one minimal traversal fixture
- [x] add a minimal `expect(...)` surface backed by the shared assertion machinery

Current non-goals:

- mocks, spies, and call-tracking helpers
- `expect(...).toThrow()` and trap-observing matcher chains
- Promise-based matchers such as `.resolves` and `.rejects`
- `expect(...)` matcher parity beyond the shared assertion/context surface
