# `jest` Adapter TODO

Status: thin adapter shipped for the current `v0.4.0` line.
Current surface is documented in [docs/005-2026-03-17-jest-adapter.md](../../../docs/005-2026-03-17-jest-adapter.md).

Repository policy note as of 2026-03-23: adapter work in `assembly/` remains repo-internal rather than a separately published npm package. Public installation is npm-only via `@as-harness/cli`, which expects a consumer-installed `assemblyscript` peer.

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
