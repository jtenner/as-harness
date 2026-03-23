# `jest` Adapter TODO

Status: thin adapter shipped for the current `v0.4.0` line.
Current surface is documented in [docs/005-2026-03-17-jest-adapter.md](../../../docs/005-2026-03-17-jest-adapter.md).

Implemented:

- `test` / `it` / `describe`
- `skip`, `todo`, `only`
- core hook family
- fixture/alias mapping
- minimal `expect(...)` matcher slice

Current non-goals:

- mocks/spies and call-tracking
- matcher-aware throw message assertions
- snapshots
- async helpers
