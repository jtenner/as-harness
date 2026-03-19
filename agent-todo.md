# Harness Buildout Tasks

Current planning milestone: `v0.2.0`. This checklist tracks the remaining
post-`v0.1.0` Wasm-runtime, host, CLI, and release slices that still block the
next release line.

## Scope Notes

Shipped `v0.1.0` baseline:

- synchronous `node:test`
- `node:assert`
- `node:assert/strict`
- shipped hosts: `js`, `wazero`
- source-only host under the supported source-host proof matrix: `wasmtime`
- deterministic result-tree reporting with pass/fail counts, failure messages, and failed-test logs
- GitHub build/tag/release distribution

Accepted `v0.2.0` scope additions:

- user-facing `as-harness run --coverage`
- `text`, `json`, `yaml`, `csv`, `lcov`, and `cobertura` coverage output
- merged coverage snapshots returned from `start()`
- coverage support through the `js`, `wazero`, and `wasmtime` hosts
- coverage as part of the shared harness contract, with `null` only when the current run did not request coverage
- coverage include/exclude filters plus point-type selection through the bundled transform path

Explicitly deferred for now:

- async or Promise-based test APIs
- snapshots
- worker-oriented user controls
- additional framework adapters beyond `node:test`
- Linux `musl`
- packaged `wasmtime`
- scheduler-step entrypoints
- reflected custom display-override decision

Explicit release-policy decisions:

- downloadable Bun-compiled executables are the official release channel
- `npm` publication is not a current release goal
- packaged releases include `js` and `wazero` only; `wasmtime` remains source-only
- the current CI source-host proof plus packaged clean-environment verification are the release-proof baseline

## v0.2.0 Blocker Slices

### Strict Equality Machinery

Cross-package scope: `cli/transform`, `assembly/`, and
`docs/strict-equality-machinery.md`.

Current blocker/risk:

- the remaining strict-equality follow-through is mostly fixture and audit work, so regressions can still hide behind the generated hook path until those runtime and diagnostics fixtures are filled in

#### Reflected Diagnostics Instrumentation

- [ ] Decide whether reflected extraction must support custom display overrides in v1 or later.

#### Compiler Wrapper Integration

- [ ] Ensure bundled virtual AssemblyScript sources can reference the transform-generated runtime hooks safely.
- [ ] Add debug output or inspection hooks so generated methods can be audited during development.

#### Fixtures and Verification

- [ ] Add runtime equality fixtures for primitives, nullability, arrays, typed arrays, maps, sets, and classes.
- [ ] Add cycle fixtures that prove recursive graphs terminate cleanly.
- [ ] Add diagnostics fixtures that prove reflected class key/value extraction matches the generated member list.
- [ ] Add `node:assert.deepEqual(...)` fixtures only after the structural core is stable.

### Framework Library Entry Points and Declaration Adapters

Current note: thin `jest` and `vitest` adapters now exist for the synchronous
declaration surface plus a small shared-assertion-backed `expect(...)` subset.
Broader matcher parity, fixtures, mocking, and async helpers remain deferred.
The current user-facing adapter surfaces are documented in
[docs/Jest.md](./docs/Jest.md) and [docs/Vitest.md](./docs/Vitest.md).

Current blocker/risk:

- additional framework work can drift into adapter-specific execution semantics unless the shared declaration/runtime boundary stays explicit and metadata capture remains standardized across adapters

- [ ] Define the exported declarations each framework entry point must provide to match that framework's test-definition surface. Do this incrementally as adapter capabilities land through `v1.0`.
- [ ] Map each framework's declaration surface onto shared internal representations for `test`, `describe`, `skip`, `todo`, hooks, and assertion integration.
- [ ] Route the shared internal declaration representations through WebAssembly imports as required by the current design.
- [ ] Standardize the metadata captured by every adapter at declaration time: node kind, name, declaration mode, callback reference, and parent scope context.
- [ ] Document the boundary between framework adapter code and the shared Wasm runtime so the adapters stay thin and deterministic.

### Traversal and Replay

Note: after the current `node:test` closeout, the remaining unchecked items in
this section stay deferred unless the project explicitly resumes fuller
host-runner work.

- [ ] Investigate whether the existing replay-based discovery/execution model has reached its practical maintenance limit before adding more adapter surface or runner features.
- [ ] Investigate AST traversal / transform-generated test-shape extraction as an alternative to replay-driven runtime visitation.
