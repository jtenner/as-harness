# as-harness

`as-harness` compiles AssemblyScript tests to Wasm and runs them through a shared harness contract.

## Current Scope

Implemented:

- `as-harness list` for discovering test entry files.
- `as-harness run` for compile + execute.
- Synchronous `node:test` declarations with `dependsOn(...)` chains.
- `node:assert` / `node:assert/strict` bridge support.
- Built-in thin adapters for `jest` and `vitest`.
- Stable start-reporting pipeline with branch, execution, planning, and blocked-dependency details.
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
- dependency cycles block all cycle members.

## API Surface

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

Current packaged artifacts:

- `bun-darwin-arm64`: `js`, `wazero`
- `bun-darwin-x64`: `js`, `wazero`
- `bun-linux-arm64`: `js`
- `bun-linux-x64`: `js`, `wazero`
- `bun-windows-x64`: `js`

`npm` publication is not the current distribution channel.

## License and Legal

- MIT project license: [LICENSE](./LICENSE)
- Third-party notices: [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)
