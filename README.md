# as-harness

`as-harness` is an AssemblyScript test-harness project. It contains:

- guest-side runtime code in `assembly/`
- a Bun CLI in `cli/`
- two working host implementations in `harness/js` and `harness/wazero`
- packaging and release workflows for target-specific Bun executables

The project goal is to make AssemblyScript tests compile into Wasm and run through a stable host contract that other harness implementations can also adopt.

## Start Here

- Project overview: [assembly/README.md](/home/jtenner/Projects/as-harness/assembly/README.md)
- CLI usage and packaging: [cli/README.md](/home/jtenner/Projects/as-harness/cli/README.md)
- Harness ABI for third-party host authors: [docs/harness-abi.md](/home/jtenner/Projects/as-harness/docs/harness-abi.md)
- Release operations and artifact expectations: [docs/release-process.md](/home/jtenner/Projects/as-harness/docs/release-process.md)
- Current runtime and product backlog: [agent-todo.md](/home/jtenner/Projects/as-harness/agent-todo.md)
- Guest runtime architecture: [docs/primary-buildout.md](/home/jtenner/Projects/as-harness/docs/primary-buildout.md)
- Strict equality and reflected diagnostics: [docs/strict-equality-machinery.md](/home/jtenner/Projects/as-harness/docs/strict-equality-machinery.md)

## v0.1.0 Scope

Planned first release scope:

- `node:test`
- `node:assert`
- `node:assert/strict`
- `js` host
- `wazero` host
- basic pass/fail reporting with failure messages
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
- `--harness js` and `--harness wazero` both work
- packaged Bun executables can run the local smoke path for both hosts
- the host parity smoke suite now covers event decoding, `callI32`, `discover`, `run`, `start`, and trampoline behavior across `js` and `wazero`
- the release workflows can build and smoke-test the packaged CLI across the intended release targets

What is still open:

- proving the GitHub Actions matrix on all hosted runners
- documenting and hardening the wazero addon install story for end users
- more complete host-facing protocol notes for independent harness authors
- deferred framework adapters and fuller `node:test` runner semantics

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
```

Switch hosts explicitly when needed:

```bash
bun run ./cli/index.ts run --harness js ./example.test.ts
bun run ./cli/index.ts run --harness wazero ./example.test.ts
```

## Release Targets

The current release-target matrix is:

- `bun-darwin-arm64`
- `bun-darwin-x64`
- `bun-linux-arm64`
- `bun-linux-x64`
- `bun-windows-x64`

Packaged `wazero` support currently ships on macOS and Linux. Packaged Windows
artifacts run through the default `js` harness for now because Bun's standalone
Windows executable path is still crashing when it loads the native `.node`
addon. Source-based Windows `wazero` development remains supported.

For `wazero`, every supported release target needs a matching `.node` addon build. The `js` host remains the portable baseline.

## Custom Harnesses

The repo is no longer documenting the host boundary only through implementation details. If you want to provide your own harness:

1. read [docs/harness-abi.md](/home/jtenner/Projects/as-harness/docs/harness-abi.md)
2. implement the Wasm import/export boundary described there
3. implement the public host surface from [harness-types.d.ts](/home/jtenner/Projects/as-harness/harness/shared/harness-types.d.ts)
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
- `docs/`
  ABI, architecture, and planning documents.
- `scripts/`
  Root validation, smoke, and release-matrix helpers.

## Development Commands

```bash
bun validate
bun test
cd harness/js && npm test
cd harness/wazero && npm test
cd cli && bun run build:list-release-targets
cd cli && bun run build:release
bun run verify:packaged-cli --target bun-linux-x64
```

## Troubleshooting

Common failure classes:

- compile failures: check `--lib` usage, entry discovery, and AssemblyScript diagnostics from the CLI
- host failures: verify the selected harness exists and that `wazero` has a matching native addon
- trap-related failures: inspect `FailMessage`, callback, and node event ordering first
- packaged CLI failures: verify the build target matches the staged addon target for `wazero`

Detailed host-specific notes live in:

- [harness/js/README.md](/home/jtenner/Projects/as-harness/harness/js/README.md)
- [harness/wazero/README.md](/home/jtenner/Projects/as-harness/harness/wazero/README.md)
- [cli/n-api/README.md](/home/jtenner/Projects/as-harness/cli/n-api/README.md)

## Release Flow

The intended release path is:

1. run local validation and host smoke tests
2. push to GitHub and let the CI matrix run
3. tag `v*`
4. let the release workflow build, verify, upload, and publish the packaged executables
5. let the publish job generate `release-manifest.json`, `SHA256SUMS.txt`, and release notes from the shared target metadata before creating or updating the GitHub release

The full operator guide for that path now lives in [docs/release-process.md](/home/jtenner/Projects/as-harness/docs/release-process.md).
