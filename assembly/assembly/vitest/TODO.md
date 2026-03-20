# `vitest` Adapter TODO

Status: first implementation slice completed, not in `v0.1.0`.
Current surface is documented in [docs/008-2026-03-19-vitest-adapter.md](../../../docs/008-2026-03-19-vitest-adapter.md).

First slice (implemented):

- `test`, `it`, `describe`, `suite`
- `skip`, `todo`, `only`, `fails`
- low-risk `sequential`
- `skipIf` / `runIf`
- `assertType(...)`
- shared `jest` matcher surface

Current non-goals:

- `vi` and spy/mocking
- promise-based helpers
- snapshots
- async helpers and broad upstream parity
