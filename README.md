# as-harness

`as-harness` compiles AssemblyScript tests to Wasm and runs them through a shared harness contract.

## Current Scope

Implemented:

- Native `as-harness` declarations with sequential groups and chainable `dependsOn(...)` handles.
- `as-harness list` for discovering test entry files.
- `as-harness run` for compile + execute.
- Synchronous `node:test` declarations with `dependsOn(...)` chains.
- `node:assert` / `node:assert/strict` bridge support.
- Built-in thin adapters for `jest`, `mocha`, `jasmine`, and `vitest`.
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

For contributor validation, the repo now uses two distinct execution proofs:

- source-host verification builds a Node-targeted CLI bundle with Bun and runs
  that bundle under the Node baseline from [`.mise.toml`](./.mise.toml)
- packaged verification stages the real compiled Bun executable from its
  release archive under a sanitized runtime environment

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
- `mocha`: sync BDD declarations, core hooks, `only` / `skip` / `x*` aliases, pending by omitted callback, and optional shared `TestContext` callbacks.
- `jasmine`: sync declarations, focus/exclude aliases, core hooks, `fail(...)`, and a narrow matcher slice backed by the shared expectation core.
- `vitest`: sync declarations, low-risk `sequential` aliases, and the same matcher slice.

See:

- [assembly/README.md](./assembly/README.md)
- [docs/003-2026-03-17-harness-abi.md](./docs/003-2026-03-17-harness-abi.md)
- [docs/006-2026-03-17-guest-runtime-contracts.md](./docs/006-2026-03-17-guest-runtime-contracts.md)
- [docs/007-2026-03-17-host-runner-contract.md](./docs/007-2026-03-17-host-runner-contract.md)
- [docs/008-2026-03-19-vitest-adapter.md](./docs/008-2026-03-19-vitest-adapter.md)
- [docs/013-2026-03-22-jasmine-adapter-interface.md](./docs/013-2026-03-22-jasmine-adapter-interface.md)
- [docs/012-2026-03-22-mocha-adapter-interface.md](./docs/012-2026-03-22-mocha-adapter-interface.md)
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

Bundled Linux `wazero` now stays on the interpreter engine as the deliberate
packaged stability policy for this release line, while source-host verification
continues to prove the repo-local `wazero` and `wasmtime` paths separately
through the Node-targeted CLI bundle.

`wasmtime` remains source-only, and the source-host matrix now validates the
native hosts through the Bun-built Node-targeted CLI bundle rather than direct
`bun run ./cli/index.ts` execution.

`npm` publication is not the current distribution channel.

## Versioning Policy

The project is still pre-`v1`, so release communication follows the common
`0.x` convention:

- `0.minor.0` releases may include breaking API or behavior changes
- `0.x.patch` releases are for non-breaking fixes and small corrections within
  that current minor line
- `1.0.0` is the point where the public API is expected to stabilize

## License and Legal

- MIT project license: [LICENSE](./LICENSE)
- Third-party notices: [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)
