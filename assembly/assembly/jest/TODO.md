# `jest` Adapter TODO

Status:

- first declaration slice implemented
- not in `v0.1.0`
- current supported surface documented in [docs/005-2026-03-17-jest-adapter.md](../../../docs/005-2026-03-17-jest-adapter.md)

First implementation slice:

- [x] map `test`, `describe`, `skip`, `todo`, and core lifecycle hooks
- [x] keep Jest-specific overloads inside this folder
- [x] add one minimal traversal fixture
- [x] add a minimal `expect(...)` surface backed by the shared assertion machinery

Current non-goals:

- mocks, spies, and call-tracking helpers
- matcher-aware throw inspection beyond a basic `expect(...).toThrow()` / `.not.toThrow()` bridge
- richer container and matcher parity beyond the current equality, containment, length/size, numeric, `NaN`, and trap-observation surface
- Promise-based matchers such as `.resolves` and `.rejects`
- `expect(...)` matcher parity beyond the shared assertion/context surface
