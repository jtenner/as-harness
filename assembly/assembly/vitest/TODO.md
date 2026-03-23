# `vitest` Adapter TODO

Status: thin adapter shipped for the current `v0.4.0` line.
Current surface is documented in [docs/008-2026-03-19-vitest-adapter.md](../../../docs/008-2026-03-19-vitest-adapter.md).

Implemented:

- `test`, `it`, `describe`, `suite`
- `skip`, `todo`, `only`, `fails`
- shared `sequential` constraints and host-default `concurrent` aliases
- `skipIf` / `runIf`
- `assertType(...)`
- shared `jest` matcher surface

Current non-goals:

- `vi` and spy/mocking
- promise-based helpers
- snapshots
- async helpers and broad upstream parity
