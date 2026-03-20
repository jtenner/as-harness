# `jest` Adapter TODO

Status: first declaration slice implemented, not in `v0.1.0`.
Current surface is documented in [docs/005-2026-03-17-jest-adapter.md](../../../docs/005-2026-03-17-jest-adapter.md).

Scope:

- `test` / `it` / `describe`
- `skip`, `todo`, `only`
- core hook family
- fixture/alias mapping
- minimal `expect(...)` matcher slice

Non-goals:

- mocks/spies and call-tracking
- matcher-aware throw message assertions
- snapshots
- async helpers
