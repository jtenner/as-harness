# @as-harness/shared

Shared host-runtime substrate for the published `as-harness` runtime packages.

Repository policy note as of 2026-03-23: public installation is npm-only, annotated tags create notes-only GitHub release pages, and the published CLI expects a consumer-installed `assemblyscript` peer.

## Purpose

- owns the shared `Harness` and coverage type declarations
- owns the shared `start()` orchestration and worker entrypoint
- owns shared coverage and snapshot helpers used by `js`, `wazero`, and
  `wasmtime`

## Export Surface

- `@as-harness/shared/harness-types`
- `@as-harness/shared/covers`
- `@as-harness/shared/covers-types`
- `@as-harness/shared/snapshots`
- `@as-harness/shared/start`

## Notes

- this package is internal packaging substrate today; the repo still stages npm
  payloads before public publication
- the runtime fixtures and shared smoke helpers remain repo-local verification
  assets rather than published package surface

## Related Docs

- [docs/007-2026-03-17-host-runner-contract.md](../../docs/007-2026-03-17-host-runner-contract.md)
- [docs/022-2026-03-23-abort-trace-debug-payload-contract.md](../../docs/022-2026-03-23-abort-trace-debug-payload-contract.md)
