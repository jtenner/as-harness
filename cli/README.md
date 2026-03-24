# @as-harness/cli

The Bun CLI compiles AssemblyScript test files to Wasm, selects a harness, and executes tests.

Public installable distribution is npm-only. The published CLI expects
`assemblyscript` to be installed by the consuming project as a peer dependency.

## Today

- `list` discovers test entries.
- `run` compiles and runs entries.
- `run --coverage` emits merged coverage in `text`, `json`, `yaml`, `csv`, `lcov`, or `cobertura`.
- `--coverage-include`, `--coverage-exclude`, and repeated `--coverage-point-type` refine instrumentation.
- `--update-snapshots` is the explicit rewrite path for host-owned snapshot artifacts.
- compile-wrapper rewriting of bare `abort(...)` / `trace(...)` emits structured host `debug` events without requiring explicit user `--use` wiring.
- `--harness` accepts built-in aliases plus project-local path and package-based custom runtimes.
- root `bun test` and release smoke flows now reuse package-local host commands (`npm test` per host).
- source-host verification builds a Node-targeted CLI bundle with Bun and runs
  that bundle under the Node baseline from [`.mise.toml`](../.mise.toml).

## Not yet

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
- blocked runs rendered as `missing prerequisite`, `blocked by prerequisite`, `dependency cycle`, `invalid constraint`, and `stopped after failure`
- unsupported hint values rendered as informational `ignored hint` planner issues without changing pass/fail status
- shared run metadata is a required `start()` snapshot that mirrors the top-level summary fields and keeps the underlying planner code plus the concise issue label on `planIssues` and `blocked`
- structured `debug` details for rewritten `abort` / `trace` events, including crumb and location context when provided by the host
- coverage after execution (when enabled)

## Bundled Libraries

- `as-harness`: native scheduler-aware declarations, `sequential(...)` groups, chainable `dependsOn(...)` handles, host-owned `inBand(...)` / `bail(...)` / `continueOnFailure(...)` hints, and shared `TestContext.assert`.
- `ava`: sync flat `test(...)` declarations, hooks, `test.macro(...)` plus explicit `use(...)` / `useNamed(...)` lowering helpers, adapter-local `ExecutionContext`, and `test.meta` placeholders.
- `uvu`: sync top-level `test` hooks, root and suite-local host-owned `inBand(...)` / `bail(...)` / `continueOnFailure(...)` hints, `suite(...)` builder objects, `exec(bail?)` root hint lowering, `.run()` no-op under host-owned execution, and adapter-local `TestContext` crumbs with `__suite__` / `__test__`.
- `uvu/assert`: shared assertion surface: `Assertion`, `ok`, `is`, `equal`, `match`, `type`, `instance`, `throws`, `snapshot`, `fixture`, `not`, `is.not`, `not.equal`, `not.match`, `not.type`, `not.instance`, `not.throws`, and `unreachable`.
- `jasmine`: sync declarations, focus/exclude aliases, core hooks, `fail(...)`, and a narrow shared matcher slice.
- `jest`: thin sync declarations + shared assertion set (containment, length/size, numeric, `toThrow`, strict equality helpers).
- `mocha`: sync BDD declarations, core hooks, `only` / `skip` / `x*` aliases, pending by omitted callback, and optional shared `TestContext` callbacks for diagnostics and assertions.
- `qunit`: sync default-exported `QUnit` root methods plus named `test` / `module` modifier exports, root and module hooks, runnable `todo(...)` lowering, and the shipped `Assert` subset with step verification.
- `tap`: sync default-exported root declarations and hooks, named root helpers, nested `t.test(...)` subtests, per-test hooks, `plan(...)`, `end()`, `comment(...)`, `teardown(...)`, and the shipped assertion subset.
- `tape`: sync default-exported `test(...)` declarations with `only` / `skip`, nested `t.test(...)`, `plan(...)`, `end()`, `teardown(...)`, `comment(...)`, and the shipped alias-heavy assertion subset.
- `vitest`: sync declarations, shared `sequential` constraints, host-default `concurrent` aliases, `fails`, `skipIf` / `runIf`, `assertType(...)`, and the same shared matcher set.
- `node:test`: sync declarations, hooks, `dependsOn(...)`, and the same host-owned planning hints.

See their interface docs:

- [docs/013-2026-03-22-jasmine-adapter-interface.md](../docs/013-2026-03-22-jasmine-adapter-interface.md)
- [docs/005-2026-03-17-jest-adapter.md](../docs/005-2026-03-17-jest-adapter.md)
- [docs/012-2026-03-22-mocha-adapter-interface.md](../docs/012-2026-03-22-mocha-adapter-interface.md)
- [docs/017-2026-03-22-ava-adapter-interface.md](../docs/017-2026-03-22-ava-adapter-interface.md)
- [docs/020-2026-03-23-qunit-adapter-interface.md](../docs/020-2026-03-23-qunit-adapter-interface.md)
- [docs/019-2026-03-23-tap-adapter-interface.md](../docs/019-2026-03-23-tap-adapter-interface.md)
- [docs/018-2026-03-22-tape-adapter-interface.md](../docs/018-2026-03-22-tape-adapter-interface.md)
- [docs/014-2026-03-22-uvu-adapter-interface.md](../docs/014-2026-03-22-uvu-adapter-interface.md)
- [docs/021-2026-03-23-uvu-assertion-class-contract.md](../docs/021-2026-03-23-uvu-assertion-class-contract.md)
- [docs/008-2026-03-19-vitest-adapter.md](../docs/008-2026-03-19-vitest-adapter.md)

## Built-In Harnesses

- `js`: portable baseline host.
- `wazero`: Go native host via Node-API, published as `@as-harness/wazero`
  plus per-platform binary packages.
- `wasmtime`: Rust native host via Node-API, published as
  `@as-harness/wasmtime` plus per-platform binary packages.

Source-host proof is a separate path: the source-host matrix builds a
Node-targeted CLI bundle with Bun, executes that bundle under Node `25.8.1`,
and uses `AS_HARNESS_SOURCE_CLI_REPO_DIR` so the bundled CLI still resolves the
repo-local `wazero` and `wasmtime` host packages during CI smoke.

## Custom Harnesses

`--harness` now accepts three selector classes:

- built-in aliases: `js`, `wazero`, `wasmtime`
- filesystem paths resolved from the invocation cwd
- package specifiers resolved from the consuming project's dependency graph

Built-in aliases win before package resolution, so external packages cannot
shadow `js`, `wazero`, or `wasmtime`.

Accepted custom module shapes, in priority order:

- `default` export object with `createHarness(...)`
- named `runtime` export object with `createHarness(...)`
- module namespace exposing `createHarness(...)` directly

Required field:

- `createHarness(bytes, options?)`

Optional fields:

- `name`: override the CLI display name used in pass/fail summaries
- `mutateCompilerArguments(args)`: append compile-time flags on top of the
  shipped default JS wrapper contract

Example:

```ts
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createHarness } = require("@as-harness/js");

export default {
	name: "custom-js",
	createHarness,
};
```

Compatibility rule:

- custom `.ts` harness modules are supported only when the CLI itself is
  running on Bun
- the Node-targeted source-host bundle supports custom `.js`, `.cjs`, and
  `.mjs` runtime modules and rejects `.ts` selectors with an explicit Bun-only
  diagnostic

## Commands

```bash
npm install -D assemblyscript @as-harness/cli
npx as-harness run ./example.test.ts
```

```bash
cd cli
bun install
bun run dev -- help
bun run dev -- run ./example.test.ts
bun run dev -- run --harness js --coverage ./example.test.ts
bun run dev -- run --harness ./tools/custom-harness.mjs ./example.test.ts
bun run dev -- run --harness @scope/custom-harness ./example.test.ts
bun run dev -- run --update-snapshots ./example.test.ts
```

```bash
bun run host:matrix
bun run verify:source-hosts -- --target linux-x64 --report-dir ./dist/source-host-reports
cd harness/js && npm test
cd harness/wazero && npm test
cd harness/wasmtime && npm test
```

## Troubleshooting

- discovery failures: check glob/ignore inputs.
- compile failures: inspect AS diagnostics.
- `AssemblyScript is required...`: install `assemblyscript` alongside
  `@as-harness/cli` in the consuming project.
- harness selection failures: confirm `--harness`, installed host packages, and
  that direct custom `.ts` selectors are running on Bun.
- source-host native failures on Windows: verify the generated Node-targeted
  source bundle path before narrowing the issue to the native host addon.

## Related Docs

- [README.md](../README.md)
- [docs/003-2026-03-17-harness-abi.md](../docs/003-2026-03-17-harness-abi.md)
- [docs/004-2026-03-17-release-process.md](../docs/004-2026-03-17-release-process.md)
- [docs/022-2026-03-23-abort-trace-debug-payload-contract.md](../docs/022-2026-03-23-abort-trace-debug-payload-contract.md)
- [cli/transform/README.md](./transform/README.md)
