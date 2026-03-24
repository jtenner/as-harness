# as-harness

`as-harness` compiles AssemblyScript tests to Wasm and runs them through a shared harness contract.

## Current Scope

Implemented:

- Native `as-harness` declarations with sequential groups, chainable `dependsOn(...)` handles, and host-owned `inBand(...)` / `bail(...)` / `continueOnFailure(...)` hints.
- `as-harness list` for discovering test entry files.
- `as-harness run` for compile + execute.
- Synchronous `node:test` declarations with `dependsOn(...)` chains and the same host-owned planning hints.
- `node:assert` / `node:assert/strict` bridge support.
- Built-in thin adapters for `jest`, `mocha`, `jasmine`, `ava`, `tap`, `tape`, `qunit`, and `vitest`.
- Built-in `uvu` adapter plus the shared `uvu/assert` surface.
- Stable start-reporting pipeline with branch, execution, planning, and blocked-outcome details.
- Structured `debug` reporting for rewritten bare `abort(...)` / `trace(...)` calls, including source crumbs and location details when hosts provide them.
- `js`, `wazero`, `wasmtime` source-host runtime support.
- Custom `--harness` selection through built-in aliases, project-local runtime modules, and consuming-project package specifiers.
- Coverage output in `text`, `json`, `yaml`, `csv`, `lcov`, `cobertura`.
- Explicit snapshot rewrite mode via `as-harness run --update-snapshots`.

Limits:

- async/Promise-based APIs are intentionally unsupported.
- thin adapters are intentionally narrow.
- public installable distribution is npm-only.

## Quick Start

```bash
bun run ./cli/index.ts list
bun run ./cli/index.ts run ./example.test.ts
bun run ./cli/index.ts run --harness wazero ./example.test.ts
bun run ./cli/index.ts run --harness ./tools/custom-harness.mjs ./example.test.ts
bun run ./cli/index.ts run --harness @scope/custom-harness ./example.test.ts
bun run ./cli/index.ts run --harness js --coverage ./example.test.ts
bun run ./cli/index.ts run --update-snapshots ./example.test.ts
```

Public npm install:

```bash
npm install -D assemblyscript @as-harness/cli
npx as-harness run ./example.test.ts
```

Custom harness selection now accepts:

- built-in aliases: `js`, `wazero`, `wasmtime`
- project-relative or absolute runtime-module paths
- package specifiers resolved from the invoking project

Built-in aliases stay reserved ahead of package resolution, so a consumer
package named `js` still selects the built-in JS harness. External harness
modules can expose either a `default` runtime object, a named `runtime` export,
or a module namespace with `createHarness(...)` directly. The required field is
`createHarness(bytes, options?)`; optional `name` controls CLI reporting and
optional `mutateCompilerArguments(args)` adds compile-time flags on top of the
default JS wrapper contract.

Direct custom `.ts` harness files are Bun-only. The Bun CLI path supports them,
but the Node-targeted source-host bundle expects custom `.js`, `.cjs`, or
`.mjs` runtime modules and fails fast with an explicit Bun-only diagnostic for
`.ts` selectors.

For contributor validation, the repo now uses two distinct execution proofs:

- source-host verification builds a Node-targeted CLI bundle with Bun and runs
  that bundle under the Node baseline from [`.mise.toml`](./.mise.toml)
- npm package verification stages the publishable package set, inspects the
  staged tarballs, and smoke-tests clean temp-project installs under Node and
  Bun

The repo also now stages npm package payloads locally and proves them with:

- `bun run npm:stage`
- `bun run npm:verify`
- `bun run npm:install-smoke`

## Dependency Notes

The runtime enforces scheduler semantics from discovered metadata:

- chainable declaration handles are honored.
- duplicate dependency edges collapse.
- `skip`, `todo`, `only`-filtered, and failing prerequisites block dependents transitively.
- `expectFailure` satisfies dependents only when it fails as intended.
- `bail` stops the remaining nearest hinted scope after the first unsatisfied execution while leaving unrelated work runnable.
- `inBand` keeps the nearest hinted scope on the main-thread execution lane while unrelated ready work can still use worker fanout.
- unsupported hint values stay visible in discovery metadata and surface as informational `ignored hint` planner issues instead of blocking execution.
- dependency cycles block all cycle members with `dependency-cycle` diagnostics.
- CLI reports blocked outcomes as concise `blocked by prerequisite`, `missing prerequisite`, `dependency cycle`, `invalid constraint`, and `stopped after failure` messages.
- shared `start()` results always include a required `metadata` snapshot that mirrors the top-level summary fields and preserves both machine-readable planner codes and concise issue labels on `planIssues` and `blocked`.
- when multiple runnable tests are ready, declaration order is the stable tie-breaker.
- the shipped `start()` scheduler is deterministic for ordering and uses same-machine worker slots for ready work when available.

## API Surface

- `as-harness`: native scheduler-aware declarations, `sequential(...)` groups, chainable handles, host-owned `inBand(...)` / `bail(...)` / `continueOnFailure(...)` hints, and shared `TestContext.assert`.
- `node:test`: core declarations, hooks, sync contexts, assertion binding, and the same host-owned planning hints.
- `node:assert`, `node:assert/strict`: synchronous assertions and strict-bridge tests.
- `uvu`: sync top-level `test` hooks, root and suite-local host-owned `inBand(...)` / `bail(...)` / `continueOnFailure(...)` hints, `suite(...)` builder objects, `exec(bail?)` root hint lowering, `.run()` compatibility no-op, and adapter-local `TestContext` crumbs with `__suite__` / `__test__`.
- `uvu/assert`: shared assertion surface: `Assertion`, `ok`, `is`, `equal`, `match`, `type`, `instance`, `throws`, `snapshot`, `fixture`, `not`, `is.not`, `not.equal`, `not.match`, `not.type`, `not.instance`, `not.throws`, and `unreachable`.
- `jest`: sync declarations, core hooks, matcher slice.
- `ava`: sync flat `test(...)` declarations, hooks, `test.macro(...)` plus explicit `use(...)` / `useNamed(...)` lowering helpers, adapter-local `ExecutionContext`, and `test.meta` placeholders.
- `mocha`: sync BDD declarations, core hooks, `only` / `skip` / `x*` aliases, pending by omitted callback, and optional shared `TestContext` callbacks.
- `jasmine`: sync declarations, focus/exclude aliases, core hooks, `fail(...)`, and a narrow matcher slice backed by the shared expectation core.
- `tap`: sync default-exported root declarations and hooks, named root helpers, nested `t.test(...)` subtests, per-test hooks, `plan(...)`, `end()`, `comment(...)`, `teardown(...)`, and the shipped assertion subset.
- `tape`: sync default-exported `test(...)` declarations with `only` / `skip`, nested `t.test(...)`, `plan(...)`, `end()`, `teardown(...)`, `comment(...)`, and the shipped alias-heavy assertion subset.
- `qunit`: sync default-exported `QUnit` root methods plus named `test` / `module` modifier exports, root and module hooks, runnable `todo(...)` lowering, and the shipped `Assert` subset with step verification.
- `vitest`: sync declarations, shared `sequential` constraints, host-default `concurrent` aliases, and the same matcher slice.

See:

- [assembly/README.md](./assembly/README.md)
- [docs/003-2026-03-17-harness-abi.md](./docs/003-2026-03-17-harness-abi.md)
- [docs/006-2026-03-17-guest-runtime-contracts.md](./docs/006-2026-03-17-guest-runtime-contracts.md)
- [docs/007-2026-03-17-host-runner-contract.md](./docs/007-2026-03-17-host-runner-contract.md)
- [docs/008-2026-03-19-vitest-adapter.md](./docs/008-2026-03-19-vitest-adapter.md)
- [docs/017-2026-03-22-ava-adapter-interface.md](./docs/017-2026-03-22-ava-adapter-interface.md)
- [docs/013-2026-03-22-jasmine-adapter-interface.md](./docs/013-2026-03-22-jasmine-adapter-interface.md)
- [docs/012-2026-03-22-mocha-adapter-interface.md](./docs/012-2026-03-22-mocha-adapter-interface.md)
- [docs/019-2026-03-23-tap-adapter-interface.md](./docs/019-2026-03-23-tap-adapter-interface.md)
- [docs/018-2026-03-22-tape-adapter-interface.md](./docs/018-2026-03-22-tape-adapter-interface.md)
- [docs/020-2026-03-23-qunit-adapter-interface.md](./docs/020-2026-03-23-qunit-adapter-interface.md)
- [docs/014-2026-03-22-uvu-adapter-interface.md](./docs/014-2026-03-22-uvu-adapter-interface.md)
- [docs/021-2026-03-23-uvu-assertion-class-contract.md](./docs/021-2026-03-23-uvu-assertion-class-contract.md)
- [docs/022-2026-03-23-abort-trace-debug-payload-contract.md](./docs/022-2026-03-23-abort-trace-debug-payload-contract.md)
- [docs/009-2026-03-19-vitest-scheduling-and-test-graph-strategy.md](./docs/009-2026-03-19-vitest-scheduling-and-test-graph-strategy.md)

## Validation

The repo pins Bun `1.3.11`, Node `25.8.1`, Go `1.26.1`, and Rust `1.94.0` in
[`.mise.toml`](./.mise.toml), and CI installs from the same file. Run `mise trust`
once for the repo and then `mise install` before the validation suite if you use
`mise`.

`bun validate` now also checks that the generated legal artifacts stay aligned
with the packaged dependency lockfiles and the `wasmtime` source-host cargo
metadata.

```bash
bun format
bun validate
bun test
cd harness/js && npm test
cd harness/wazero && npm test
cd harness/wasmtime && npm test
bun run npm:stage
bun run npm:verify
bun run npm:install-smoke
```

Helpful checks:

```bash
bun run host:matrix
bun run verify:source-hosts -- --target linux-x64 --report-dir ./dist/source-host-reports
```

See also:

- [cli/README.md](./cli/README.md) for the CLI-specific selector and contract details
- [docs/007-2026-03-17-host-runner-contract.md](./docs/007-2026-03-17-host-runner-contract.md) for the shared host object contract and the CLI runtime module surface

## Release Packaging

Public installable distribution is now npm-only.

The tag workflow publishes the staged lockstep npm package set after
cross-platform pack and install-smoke verification, then creates or updates a
notes-only GitHub release page from the annotated tag contents. The staged npm
lane includes `@as-harness/shared`, `@as-harness/js`,
`@as-harness/wazero`, `@as-harness/wasmtime`, and `@as-harness/cli` plus
optional per-platform `wazero-*` and `wasmtime-*` native packages. On
the release matrix, `linux-x64` currently builds all packages while the other
platform jobs build the full common package surface plus their host-native
package slice. Release publication is intended to use npm trusted publishing
from the `release.yml` GitHub Actions workflow rather than a shared
`NPM_TOKEN` secret.

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
- Source-build `wasmtime` inventory:
  [licenses/wasmtime/THIRD_PARTY_INVENTORY.md](./licenses/wasmtime/THIRD_PARTY_INVENTORY.md)
- Public npm installs require a consumer-installed `assemblyscript` peer for
  `@as-harness/cli`.
