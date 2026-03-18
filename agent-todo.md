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
- scheduler-step entrypoint decision
- reflected custom display-override decision

## v0.2.0 Blocker Slices

### Coverage Shipping

- [x] Ship `as-harness run --coverage` through the CLI, compiler wrapper, guest coverage declarations, and host imports.
- [x] Merge per-worker coverage snapshots and surface merged coverage on `HarnessStartResult`.
- [x] Emit `text`, `json`, `yaml`, `csv`, `lcov`, and `cobertura` reports as the current public coverage-output contract.
- [x] Document the conditional `__asCovers` ABI surface and the shared host coverage contract.
- [x] Reach `wasmtime` coverage parity for `v0.2.0`.
- [x] Ship coverage include/exclude filters plus point-type selection through the CLI and bundled transform path.

Cross-package scope: root CLI/product surface plus `assembly/`, `harness/js`,
`harness/wazero`, `harness/wasmtime`, and the top-level docs/release workflow.

### Host Runtime Shipping

- [x] Prove `harness/js` works on the supported Node versions for the release.
- [x] Prove `harness/wazero` builds and runs on the supported OS / architecture matrix.
- [x] Prove `harness/wasmtime` builds and runs across the intended source-host validation matrix.
- [x] Keep Node.js `22` as the explicit first supported source-host baseline.

### Wasm Runtime / ABI

- [ ] Finish the remaining host-runner contract items required for shipping.
- [ ] Keep the ABI flat, language-agnostic, and stable enough to support multiple shipped or source hosts.
- [ ] Decide whether scheduler-step entrypoints are required for the shipped runner or explicitly deferred.

### Release Engineering

- [ ] Revisit standalone Bun-compiled CLI binaries vs `npm` packaging after the first release workflow is proven.
- [x] Verify install and smoke-run flows from a clean environment on each supported platform.

### Strict Equality Machinery

Cross-package scope: `cli/transform`, `assembly/`, and
`docs/strict-equality-machinery.md`.

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

Current note: a thin `jest` adapter now exists for `test` / `it` / `describe`,
skip/todo/only aliases, core hooks, and a small shared-assertion-backed
`expect(...)` surface including equality, containment, length/size checks,
numeric checks, `NaN`, and `toThrow()`. Full matcher parity, mocking, and async
Jest helpers remain deferred. The current user-facing adapter surface is
documented in [docs/Jest.md](./docs/Jest.md).

- [ ] Define the exported declarations each framework entry point must provide to match that framework's test-definition surface. Do this incrementally as adapter capabilities land through `v1.0`.
- [ ] Map each framework's declaration surface onto shared internal representations for `test`, `describe`, `skip`, `todo`, hooks, and assertion integration.
- [ ] Route the shared internal declaration representations through WebAssembly imports as required by the current design.
- [ ] Standardize the metadata captured by every adapter at declaration time: node kind, name, declaration mode, callback reference, and parent scope context.
- [ ] Document the boundary between framework adapter code and the shared Wasm runtime so the adapters stay thin and deterministic.

### Traversal and Replay

Note: after the current `node:test` closeout, the remaining unchecked items in
this section stay deferred unless the project explicitly resumes fuller
host-runner work.

- [ ] Investigate AST traversal / transform-generated test-shape extraction as an alternative to replay-driven runtime visitation.
- [ ] Define the targeted traversal input contract for replaying toward a requested node path.
- [ ] Emit `NodeFound` during discovery for every structurally visible node.
- [ ] Enforce declaration-mode traversal semantics for `skip`: emit discovery metadata, stop traversal at that node, and do not traverse children.
- [ ] Enforce declaration-mode traversal semantics for `todo`: emit discovery metadata, continue descendant traversal, and suppress the node's own outcome significance.

### ABI Boundary

- [ ] Decide whether scheduler-step entrypoints are required now or deferred.
- [ ] Keep the ABI simple, flat, and language-agnostic.

### Ephemeral Runtime State

- [ ] Implement attempt-local tracking for the active node path.
- [ ] Track current hook phase during lifecycle execution.
- [ ] Track the current traversal target.
- [ ] Maintain per-traversal child discovery buffers.
- [ ] Maintain temporary replay state needed to rediscover branches.
- [ ] Reset ephemeral state cleanly between attempts so the host remains the durable source of truth.

### Contracts, Fixtures, and Verification

- [ ] Write a module-by-module contract for `api`, `registry`, `traversal`, `executor`, `hooks`, `assert_bridge`, `events`, `abi`, and `state`.
- [ ] For each module, define inputs, outputs, owned state, and forbidden decisions.
