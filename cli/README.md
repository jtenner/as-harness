# @as-harness/cli

The Bun CLI compiles AssemblyScript test files to Wasm, selects a harness, and executes tests.

## Today

- `list` discovers test entries.
- `run` compiles and runs entries.
- `run --coverage` emits merged coverage in `text`, `json`, `yaml`, `csv`, `lcov`, or `cobertura`.
- `--coverage-include`, `--coverage-exclude`, and repeated `--coverage-point-type` refine instrumentation.
- `--harness js|wazero|wasmtime` selects the runtime.
- `build.ts` builds target-specific packaged executables; release packaging wraps them into target-specific archives.
- root `bun test` and release smoke flows now reuse package-local host commands (`npm test` per host).
- source-host verification builds a Node-targeted CLI bundle with Bun and runs
  that bundle under the Node baseline from [`.mise.toml`](../.mise.toml).

## Not yet

- external harness plugin loading
- stable external runtime selection API
- full historical release proof across every hosted runner

## Runtime Model

1. CLI compiles AssemblyScript with bundled guest libraries.
2. It hands Wasm bytes to one selected host runtime.
3. The host runs `start()` via the shared runner contract.

The host contract is `Runtime` in [types.ts](./runtime/types.ts). The wire ABI is [docs/003-2026-03-17-harness-abi.md](../docs/003-2026-03-17-harness-abi.md).

## Report Semantics

Default reporting summarizes:

- counts, passes/failures, and diagnostics
- planner status from `discoveryOk`, `planningOk`, and `workerCount`
- blocked runs rendered as `missing prerequisite`, `blocked by prerequisite`, `dependency cycle`, and `stopped after failure`
- shared run metadata is a required `start()` snapshot that mirrors the top-level summary fields and keeps the underlying planner code plus the concise issue label on `planIssues` and `blocked`
- coverage after execution (when enabled)

## Bundled Libraries

- `as-harness`: native scheduler-aware declarations, `sequential(...)` groups, chainable `dependsOn(...)` handles, host-owned `inBand(...)` / `bail(...)` / `continueOnFailure(...)` hints, and shared `TestContext.assert`.
- `uvu`: sync top-level `test` hooks, `suite(...)` builder objects, `.run()` / `exec()` no-ops under host-owned execution, and shared `TestContext` callbacks.
- `uvu/assert`: shared assertion subset: `ok`, `is`, `equal`, `not`, `is.not`, `not.equal`, and `unreachable`.
- `jasmine`: sync declarations, focus/exclude aliases, core hooks, `fail(...)`, and a narrow shared matcher slice.
- `jest`: thin sync declarations + shared assertion set (containment, length/size, numeric, `toThrow`, strict equality helpers).
- `mocha`: sync BDD declarations, core hooks, `only` / `skip` / `x*` aliases, pending by omitted callback, and optional shared `TestContext` callbacks for diagnostics and assertions.
- `vitest`: sync declarations, low-risk `sequential` aliases, `fails`, `skipIf` / `runIf`, `assertType(...)`, and the same shared matcher set.
- `node:test`: sync declarations, hooks, `dependsOn(...)`, and the same host-owned planning hints.

See their interface docs:

- [docs/013-2026-03-22-jasmine-adapter-interface.md](../docs/013-2026-03-22-jasmine-adapter-interface.md)
- [docs/005-2026-03-17-jest-adapter.md](../docs/005-2026-03-17-jest-adapter.md)
- [docs/012-2026-03-22-mocha-adapter-interface.md](../docs/012-2026-03-22-mocha-adapter-interface.md)
- [docs/014-2026-03-22-uvu-adapter-interface.md](../docs/014-2026-03-22-uvu-adapter-interface.md)
- [docs/008-2026-03-19-vitest-adapter.md](../docs/008-2026-03-19-vitest-adapter.md)

## Built-In Harnesses

- `js`: portable baseline host.
- `wazero`: Go native host via Node-API.
- `wasmtime`: Rust native host via Node-API (source execution + CI smoke only, not packaged).

Packaging matrix:

- `bun-darwin-arm64`: `js`, `wazero`
- `bun-darwin-x64`: `js`, `wazero`
- `bun-linux-arm64`: `js`
- `bun-linux-x64`: `js`, `wazero`
- `bun-windows-x64`: `js`

The packaged archive keeps the executable basename stable as `as-harness`
(`as-harness.exe` on Windows). `wazero` targets keep the native addon bundled
inside that executable, so extraction preserves the Bun-compiled basename that
successfully loads the embedded addon.

Source-host proof is a separate path: the source-host matrix builds a
Node-targeted CLI bundle with Bun, executes that bundle under Node `25.8.1`,
and uses `AS_HARNESS_SOURCE_CLI_REPO_DIR` so the bundled CLI still resolves the
repo-local `wazero` and `wasmtime` host packages during CI smoke.

Packaged Linux `wazero` intentionally stays on the interpreter engine for the
current release line, while source-host proof keeps the repo-local runtime path
separate and explicit.

## Commands

```bash
cd cli
bun install
bun run dev -- help
bun run dev -- run ./example.test.ts
bun run dev -- run --harness js --coverage ./example.test.ts
bun run build
bun run build:release
```

```bash
bun run host:matrix
bun run verify:source-hosts -- --target linux-x64 --report-dir ./dist/source-host-reports
cd harness/js && npm test
cd harness/wazero && npm test
cd harness/wasmtime && npm test
bun run release:matrix
bun run verify:packaged-cli -- --target bun-linux-x64 --report-dir ./dist/packaged-cli-reports
```

## Troubleshooting

- discovery failures: check glob/ignore inputs.
- compile failures: inspect AS diagnostics.
- harness selection failures: confirm `--harness` and packaged host support.
- packaged failures: verify host addons, target match, and release tags.
- source-host native failures on Windows: verify the generated Node-targeted
  source bundle path before narrowing the issue to the native host addon.

## Related Docs

- [README.md](../README.md)
- [docs/003-2026-03-17-harness-abi.md](../docs/003-2026-03-17-harness-abi.md)
- [docs/004-2026-03-17-release-process.md](../docs/004-2026-03-17-release-process.md)
- [cli/n-api/README.md](./n-api/README.md)
- [cli/transform/README.md](./transform/README.md)
