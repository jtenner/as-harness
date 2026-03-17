# as-harness

`as-harness` is an AssemblyScript test-harness project. It contains:

- guest-side runtime code in `assembly/`
- a Bun CLI in `cli/`
- three host implementations in `harness/js`, `harness/wazero`, and `harness/wasmtime`
- packaging and release workflows for target-specific Bun executables

The project goal is to make AssemblyScript tests compile into Wasm and run through a stable host contract that other harness implementations can also adopt.

## Start Here

- Project overview: [assembly/README.md](./assembly/README.md)
- CLI usage and packaging: [cli/README.md](./cli/README.md)
- Harness ABI for third-party host authors: [docs/harness-abi.md](./docs/harness-abi.md)
- Release operations and artifact expectations: [docs/release-process.md](./docs/release-process.md)
- Project license: [LICENSE](./LICENSE)
- Current runtime and product backlog: [agent-todo.md](./agent-todo.md)
- Guest runtime architecture: [docs/primary-buildout.md](./docs/primary-buildout.md)
- Strict equality and reflected diagnostics: [docs/strict-equality-machinery.md](./docs/strict-equality-machinery.md)

## v0.1.0 Scope

Planned first release scope:

- `node:test`
- `node:assert`
- `node:assert/strict`
- `js` host
- `wazero` host
- deterministic result-tree reporting with pass/fail counts, failure messages, and failed-test logs
- GitHub build/tag/release distribution

Explicit non-goals for `v0.1.0`:

- async or Promise-based test APIs
- snapshots
- worker-oriented user controls
- additional framework adapters beyond `node:test`
- Linux `musl`
- npm publication as the primary release channel

## Feature Matrix

What works today:

- the CLI discovers entry files, compiles them, and runs them
- `--coverage` now emits merged reports in `text`, `json`, `yaml`, `csv`, `lcov`, or `cobertura` form when you run through `--harness js`, `--harness wazero`, or `--harness wasmtime`
- coverage runs can be scoped with `--coverage-include`, `--coverage-exclude`, and repeated `--coverage-point-type` flags
- `--harness js`, `--harness wazero`, and `--harness wasmtime` all work in source mode
- a thin Jest-shaped adapter is available when the compile path includes `--lib jest`, including a small `expect(...)` surface for equality, containment, length/size checks, numeric checks, `NaN`, and `toThrow()`
- packaged Bun executables can run the local smoke path for the supported `js`/`wazero` release matrix
- `wasmtime` currently stays source-only and is not bundled into the packaged Bun release artifacts
- the host parity smoke suite now covers event decoding, `callI32`, `discover`, `run`, `start`, and trampoline behavior across `js`, `wazero`, and `wasmtime`
- AssemblyScript `trace(...)` calls now surface through first-class host `log` events
- CI now runs a source-host smoke matrix across the supported GitHub-hosted runners while keeping the packaged release matrix limited to the proven `js`/`wazero` artifact set
- each source-host CI job now emits a per-target verification report so host proof is tied to an explicit matrix label instead of only raw job logs
- the release workflows can build and smoke-test the packaged CLI across the intended release targets
- the release workflow now publishes `release-manifest.json`, `SHA256SUMS.txt`, and generated release notes alongside the packaged executables
- the release workflow now stages third-party licensing files alongside the packaged executables
- the packaged release path now enforces Git tag to CLI version alignment for `v0.1.0`

What is still open:

- final end-user release proof beyond CI, especially download-and-run verification on each supported platform
- the remaining host-runner contract and ABI-stability cleanup listed in [agent-todo.md](./agent-todo.md)
- deferred framework adapters and fuller `node:test` runner semantics
- fuller Jest compatibility beyond thin declarations, core hooks, and the small shared-assertion-backed `expect(...)` surface for equality, containment, length/size checks, numeric checks, `NaN`, and `toThrow()`

## Quick Start

Write a test like:

```ts
import { test } from "node:test";

test("adds numbers", (t) => {
	t.assert.strictEqual<i32>(1 + 1, 2);
});
```

Then run it with the CLI:

```bash
bun run ./cli/index.ts run ./example.test.ts
bun run ./cli/index.ts run --harness js --coverage ./example.test.ts
bun run ./cli/index.ts run --harness js --coverage --coverage-format lcov --coverage-include "src/**/*.ts" --coverage-point-type function ./example.test.ts
```

Switch hosts explicitly when needed:

```bash
bun run ./cli/index.ts run --harness js ./example.test.ts
bun run ./cli/index.ts run --harness wazero ./example.test.ts
bun run ./cli/index.ts run --harness wasmtime ./example.test.ts
```

For the current Jest-shaped guest API, including the exact `expect(...)`
matcher set, alias semantics, and `toThrow()` callback rules, see
[docs/Jest.md](./docs/Jest.md).

## Release Targets

The current release-target matrix is:

- `bun-darwin-arm64`
- `bun-darwin-x64`
- `bun-linux-arm64`
- `bun-linux-x64`
- `bun-windows-x64`

Packaged `wazero` support currently ships on:

- `bun-darwin-arm64`
- `bun-darwin-x64`
- `bun-linux-x64`

Packaged `js`-only artifacts currently ship on:

- `bun-linux-arm64`
- `bun-windows-x64`

Packaged Windows falls back to `js` because Bun's standalone Windows
executable path is still crashing when it loads the native `.node` addon.
Packaged Linux arm64 currently falls back to `js` because the hosted packaged
`wazero` smoke is still timing out on the standalone Bun executable path.
Source-based `wazero` development remains supported on both platforms.

For `wazero`, every supported release target needs a matching `.node` addon build. The `js` host remains the portable baseline.

## Custom Harnesses

The repo is no longer documenting the host boundary only through implementation details. If you want to provide your own harness:

1. read [docs/harness-abi.md](./docs/harness-abi.md)
2. implement the Wasm import/export boundary described there
3. implement the public host surface from [harness-types.d.ts](./harness/shared/harness-types.d.ts)
4. smoke-test your harness against the same guest exports and event semantics

The CLI currently resolves built-in harnesses, but the ABI guide is written so external harness implementations can target the same contract.

## Repo Map

- `assembly/`
  Guest-side AssemblyScript runtime, adapters, and fixtures.
- `cli/`
  Bun CLI, compiler wrapper, bundled support-file generation, and release-target build tooling.
- `harness/js/`
  Pure JavaScript host implementation.
- `harness/wazero/`
  Go `Node-API` host implementation.
- `harness/wasmtime/`
  Rust `Node-API` host implementation built on `wasmtime`.
- `docs/`
  ABI, architecture, and planning documents.
- `scripts/`
  Root validation, smoke, and release-matrix helpers.
- `licenses/`
  Third-party license texts staged into release assets.
- `THIRD_PARTY_NOTICES.md`
  Human-readable notice summary for shipped third-party components.

## Development Commands

```bash
bun validate
bun test
bun run host:matrix
bun run verify:source-hosts -- --target linux-x64 --report-dir ./dist/source-host-reports
cd harness/js && npm test
cd harness/wazero && npm test
cd harness/wasmtime && npm test
cd cli && bun run build:list-release-targets
cd cli && bun run build:release
bun run verify:packaged-cli --target bun-linux-x64
```

## Troubleshooting

Common failure classes:

- compile failures: check `--lib` usage, entry discovery, and AssemblyScript diagnostics from the CLI
- missing log output: the default reporter only prints `diagnostic` and `trace` logs for failed executions
- host failures: verify the selected harness exists and that `wazero` has a matching native addon
- wasmtime host failures: verify that Rust is installed and `harness/wasmtime/dist/wasmtime.node` has been built
- trap-related failures: inspect `FailMessage`, callback, and node event ordering first
- packaged CLI failures: verify the build target matches the staged addon target for `wazero`

Detailed host-specific notes live in:

- [harness/js/README.md](./harness/js/README.md)
- [harness/wazero/README.md](./harness/wazero/README.md)
- [harness/wasmtime/README.md](./harness/wasmtime/README.md)
- [cli/n-api/README.md](./cli/n-api/README.md)

## License

The `as-harness` project is licensed under MIT. See [LICENSE](./LICENSE).

Third-party release notices and license texts live in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) and [licenses/](./licenses).

## Release Flow

The intended release path is:

1. run local validation and host smoke tests
2. push to GitHub and let the CI matrix run
3. tag `v*`
4. let the release workflow build, verify, upload, and publish the packaged executables
5. let the publish job stage `THIRD_PARTY_NOTICES.md` plus third-party license texts, then generate `release-manifest.json`, `SHA256SUMS.txt`, and release notes before creating or updating the GitHub release

The full operator guide for that path now lives in [docs/release-process.md](./docs/release-process.md).
