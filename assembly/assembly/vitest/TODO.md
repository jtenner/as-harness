# `vitest` Adapter TODO

Status: thin adapter shipped for the current `v0.4.0` line.
Current surface is documented in [docs/008-2026-03-19-vitest-adapter.md](../../../docs/008-2026-03-19-vitest-adapter.md).

Repository policy note as of 2026-03-23: adapter work in `assembly/` remains repo-internal rather than a separately published npm package. Public installation is npm-only via `@as-harness/cli`, which expects a consumer-installed `assemblyscript` peer.

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
