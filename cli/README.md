# @as-harness/cli

The Bun CLI compiles AssemblyScript test files to Wasm, selects a harness, and executes tests.

## Today

- `list` discovers test entries.
- `run` compiles and runs entries.
- `run --coverage` emits merged coverage in `text`, `json`, `yaml`, `csv`, `lcov`, or `cobertura`.
- `--coverage-include`, `--coverage-exclude`, and repeated `--coverage-point-type` refine instrumentation.
- `--harness js|wazero|wasmtime` selects the runtime.
- `build.ts` builds target-specific packaged executables.
- root `bun test` and release smoke flows now reuse package-local host commands (`npm test` per host).

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
- blocked runs rendered as `missing prerequisite`, `blocked by prerequisite`, and `dependency cycle`
- shared run metadata is a required `start()` snapshot that mirrors the top-level summary fields and keeps the underlying planner code plus the concise issue label on `planIssues` and `blocked`
- coverage after execution (when enabled)

Linux `wazero` defaults to in-band `start()` execution because the native worker-thread path has been flaky on hosted runners. Set `AS_HARNESS_WAZERO_PARALLEL=1` to re-enable worker-thread execution when you need to probe that path explicitly.

## Bundled Libraries

- `as-harness`: native scheduler-aware declarations, `sequential(...)` groups, chainable `dependsOn(...)` handles, and shared `TestContext.assert`.
- `jest`: thin sync declarations + shared assertion set (containment, length/size, numeric, `toThrow`, strict equality helpers).
- `vitest`: sync declarations, low-risk `sequential` aliases, `fails`, `skipIf` / `runIf`, `assertType(...)`, and the same shared matcher set.

See their interface docs:

- [docs/005-2026-03-17-jest-adapter.md](../docs/005-2026-03-17-jest-adapter.md)
- [docs/008-2026-03-19-vitest-adapter.md](../docs/008-2026-03-19-vitest-adapter.md)

## Built-In Harnesses

- `js`: portable baseline host.
- `wazero`: Go native host via Node-API.
- `wasmtime`: Rust native host via Node-API (source execution + CI smoke only, not packaged).

Packaging matrix:

- macOS: `js`, `wazero`
- Linux x64: `js`, `wazero`
- Linux arm64: `js`
- Windows: `js`

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

## Related Docs

- [README.md](../README.md)
- [docs/003-2026-03-17-harness-abi.md](../docs/003-2026-03-17-harness-abi.md)
- [docs/004-2026-03-17-release-process.md](../docs/004-2026-03-17-release-process.md)
- [cli/n-api/README.md](./n-api/README.md)
- [cli/transform/README.md](./transform/README.md)
