# as-harness

`as-harness` compiles AssemblyScript tests to Wasm and runs them through a shared harness contract.

## Current Scope

Implemented:

- Native `as-harness` declarations with sequential groups and chainable `dependsOn(...)` handles.
- `as-harness list` for discovering test entry files.
- `as-harness run` for compile + execute.
- Synchronous `node:test` declarations with `dependsOn(...)` chains.
- `node:assert` / `node:assert/strict` bridge support.
- Built-in thin adapters for `jest` and `vitest`.
- Stable start-reporting pipeline with branch, execution, planning, and blocked-outcome details.
- `js`, `wazero`, `wasmtime` source-host runtime support.
- Coverage output in `text`, `json`, `yaml`, `csv`, `lcov`, `cobertura`.

Limits:

- async/Promise-based APIs are intentionally unsupported.
- thin adapters are intentionally narrow.
- `wasmtime` is source-only; packaged releases stay `js` + `wazero` only.

## Quick Start

```bash
bun run ./cli/index.ts list
bun run ./cli/index.ts run ./example.test.ts
bun run ./cli/index.ts run --harness wazero ./example.test.ts
bun run ./cli/index.ts run --harness js --coverage ./example.test.ts
```

## Dependency Notes

The runtime enforces scheduler semantics from discovered metadata:

- chainable declaration handles are honored.
- duplicate dependency edges collapse.
- `skip`, `todo`, `only`-filtered, and failing prerequisites block dependents transitively.
- `expectFailure` satisfies dependents only when it fails as intended.
- dependency cycles block all cycle members with `dependency-cycle` diagnostics.
- CLI reports blocked outcomes as concise `blocked by prerequisite`, `missing prerequisite`, and `dependency cycle` messages.
- shared `start()` results always include a required `metadata` snapshot that mirrors the top-level summary fields and preserves both machine-readable planner codes and concise issue labels on `planIssues` and `blocked`.
- when multiple runnable tests are ready, declaration order is the stable tie-breaker.
- the shipped `start()` scheduler is deterministic for ordering and uses same-machine worker slots for ready work when available.

## API Surface

- `as-harness`: native scheduler-aware declarations, `sequential(...)` groups, chainable handles, and shared `TestContext.assert`.
- `node:test`: core declarations, hooks, sync contexts, and assertion binding.
- `node:assert`, `node:assert/strict`: synchronous assertions and strict-bridge tests.
- `jest`: sync declarations, core hooks, matcher slice.
- `vitest`: sync declarations, low-risk `sequential` aliases, and the same matcher slice.

See:

- [assembly/README.md](./assembly/README.md)
- [docs/003-2026-03-17-harness-abi.md](./docs/003-2026-03-17-harness-abi.md)
- [docs/006-2026-03-17-guest-runtime-contracts.md](./docs/006-2026-03-17-guest-runtime-contracts.md)
- [docs/007-2026-03-17-host-runner-contract.md](./docs/007-2026-03-17-host-runner-contract.md)
- [docs/008-2026-03-19-vitest-adapter.md](./docs/008-2026-03-19-vitest-adapter.md)
- [docs/009-2026-03-19-vitest-scheduling-and-test-graph-strategy.md](./docs/009-2026-03-19-vitest-scheduling-and-test-graph-strategy.md)

## Validation

The repo pins Bun `1.3.11`, Node `25.8.1`, Go `1.26.1`, and Rust `1.94.0` in
[`.mise.toml`](./.mise.toml), and CI installs from the same file. Run `mise trust`
once for the repo and then `mise install` before the validation suite if you use
`mise`.

```bash
bun format
bun validate
bun test
cd harness/js && npm test
cd harness/wazero && npm test
cd harness/wasmtime && npm test
```

Helpful checks:

```bash
bun run host:matrix
bun run verify:source-hosts -- --target linux-x64 --report-dir ./dist/source-host-reports
cd cli && bun run build:list-release-targets
cd cli && bun run build:release
bun run verify:packaged-cli -- --target bun-linux-x64 --report-dir ./dist/packaged-cli-reports
```

## Release Packaging

Current packaged release archives:

- `bun-darwin-arm64`: `js`, `wazero`
- `bun-darwin-x64`: `js`, `wazero`
- `bun-linux-arm64`: `js`
- `bun-linux-x64`: `js`, `wazero`
- `bun-windows-x64`: `js`

Each archive preserves the inner executable name as `as-harness` (or
`as-harness.exe` on Windows), and `wazero` targets keep the native addon
bundled inside that executable so extraction does not rename the compiled
binary away from Bun's working embedded-addon path.

`npm` publication is not the current distribution channel.

## License and Legal

- MIT project license: [LICENSE](./LICENSE)
- Third-party notices: [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)
