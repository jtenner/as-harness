# Assembly Roadmap

Adapter-level intent for guest runtime work.

## Current priorities

- keep `node:test` and assertion core stable
- keep host contracts explicit as they evolve
- keep ABI documentation current for additional host implementations
- keep runtime capabilities aligned with language limits

## Current scope limits

- mock/spy APIs relying on closures or call tracking
- Promise-based helpers and async assertion APIs
- matcher-heavy assertion surfaces requiring richer runtime object modeling

## Adapter set

Tracked adapters: `as-harness`, `node:test`, `node:assert`, `jest`, `vitest`, `mocha`, `ava`, `tap`, `tape`, `uvu`, `jasmine`, `qunit`.

Active surface today: `as-harness`, `node:test`, `jest`, `vitest`.

For each adapter workstream, start from the doc + TODO pair:

- declaration behavior
- non-goals
- minimal fixture path

## Reference

- [docs/005-2026-03-17-jest-adapter.md](../docs/005-2026-03-17-jest-adapter.md)
- [docs/008-2026-03-19-vitest-adapter.md](../docs/008-2026-03-19-vitest-adapter.md)
- [docs/003-2026-03-17-harness-abi.md](../docs/003-2026-03-17-harness-abi.md)
