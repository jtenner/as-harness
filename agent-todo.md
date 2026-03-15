# Harness Buildout Tasks

Primary scope: `assembly/`. This checklist covers the remaining Wasm-side
runtime work defined in `docs/primary-buildout.md` plus the release-gating host
and CLI work needed to ship the runner.

## Publish Blockers

Cross-package scope: root CLI/product surface plus `assembly/`, `harness/js`,
`harness/wazero`, and the top-level docs/release workflow.

### Product Definition

- [ ] Freeze the first shippable product scope for an AssemblyScript test runner.
- [ ] Decide which surfaces are explicitly in scope for v1:
- [ ] synchronous `node:test`
- [ ] `node:assert`
- [ ] `node:assert/strict`
- [ ] `js` host
- [ ] `wazero` host
- [ ] Decide which currently deferred features stay out of scope for v1:
- [ ] async / Promise-based test APIs
- [ ] snapshots
- [ ] worker-oriented execution controls
- [ ] additional framework adapters beyond `node:test`

### CLI Runner

- [ ] Implement `as-harness run` as a real execution path instead of a scaffold.
- [ ] Resolve entry files, compile them, and execute them through a selected host.
- [ ] Forward the documented `run` compiler/runtime flags into the actual CLI implementation.
- [ ] Decide and implement host selection policy for shipped builds:
- [ ] default host
- [ ] explicit host override
- [ ] unsupported-host failure behavior
- [ ] Emit stable process exit codes for pass, test failure, compile failure, and host/runtime failure.
- [ ] Add human-readable run summaries and failure output suitable for normal CLI use.
- [ ] Decide whether coverage is deferred or included in the first shipped release.

### Host Runtime Shipping

- [ ] Keep the shipped `js` and `wazero` host surfaces behaviorally aligned for:
- [ ] event decoding
- [ ] `callI32(exportName)`
- [ ] `discover(nodeIndex)`
- [ ] `run(nodeIndex)`
- [ ] trampoline-backed trap observation
- [ ] Decide the supported host/platform matrix for the first release.
- [ ] Prove `harness/js` works on the supported Node versions for the release.
- [ ] Prove `harness/wazero` builds and runs on the supported OS / architecture matrix.
- [ ] Package or document the wazero native-addon build/install story so users can actually run it.
- [ ] Decide how the CLI bundles, locates, or installs shipped host runtimes.
- [ ] Add end-to-end CLI coverage for both the `js` and `wazero` execution paths.

### Wasm Runtime / ABI

- [ ] Finish the host-runner contract items that are still open below and are required for shipping.
- [ ] Write protocol notes for host implementers that do not rely on reading AssemblyScript internals.
- [ ] Keep the ABI flat, language-agnostic, and stable enough to support both shipped hosts.
- [ ] Decide whether scheduler-step entrypoints are required for the shipped runner or explicitly deferred.
- [ ] Add fixtures that cover replay invalidation, branch pruning, lifecycle callback failure propagation, and clean recovery after traps.

### Reporting, UX, and Docs

- [ ] Document the user-facing workflow for writing and running AssemblyScript tests with the shipped runner.
- [ ] Document the supported feature matrix and explicit non-goals for the first release.
- [x] Document `js` vs `wazero` host tradeoffs, requirements, and platform caveats.
- [ ] Add troubleshooting guidance for compile failures, traps, assertion failures, and wazero addon build issues.
- [ ] Ensure the README set and CLI help text describe the same shipped behavior.

### Release Engineering

- [ ] Decide the first distribution channel:
- [ ] standalone Bun-compiled CLI binaries
- [ ] npm package
- [ ] both
- [ ] Add CI coverage for validation, root tests, host package smoke tests, and release-artifact verification.
- [ ] Define release/versioning steps for the CLI package and shipped host runtimes.
- [ ] Verify install and smoke-run flows from a clean environment on each supported platform.

## Strict Equality Machinery

Cross-package scope: `cli/transform`, `assembly/`, and
`docs/strict-equality-machinery.md`.

### Reflected Diagnostics Instrumentation

- [ ] Decide whether reflected extraction must support custom display overrides in v1 or later.

### Assembly Runtime Reflected Value Core

- [ ] Define whether stack traces or source context attach to reflected values in v1 or later.

### Assertion Bridge Integration

- [ ] Decide whether default deep-equality failure messages are generated in the guest, in the host, or deferred.

### Compiler Wrapper Integration

- [ ] Ensure bundled virtual AssemblyScript sources can reference the transform-generated runtime hooks safely.
- [ ] Add debug output or inspection hooks so generated methods can be audited during development.

### Fixtures and Verification

- [ ] Add runtime equality fixtures for primitives, nullability, arrays, typed arrays, maps, sets, and classes.
- [ ] Add cycle fixtures that prove recursive graphs terminate cleanly.
- [ ] Add diagnostics fixtures that prove reflected class key/value extraction matches the generated member list.
- [ ] Add `node:assert.deepEqual(...)` fixtures only after the structural core is stable.

## Framework Library Entry Points and Declaration Adapters

- [ ] Define the exported declarations each framework entry point must provide to match that framework's test-definition surface.
- [ ] Map each framework's declaration surface onto shared internal representations for `test`, `describe`, `skip`, `todo`, hooks, and assertion integration.
- [ ] Route the shared internal declaration representations through WebAssembly imports as required by the current design.
- [ ] Standardize the metadata captured by every adapter at declaration time: node kind, name, declaration mode, callback reference, and parent scope context.
- [ ] Document the boundary between framework adapter code and the shared Wasm runtime so the adapters stay thin and deterministic.

## Traversal and Replay

Note: after the current `node:test` closeout, the remaining unchecked items in
this section are deferred unless the project explicitly resumes fuller
host-runner work.

- [ ] Define the targeted traversal input contract for replaying toward a requested node path.
- [ ] Emit `NodeFound` during discovery for every structurally visible node.
- [ ] Enforce declaration-mode traversal semantics:
- [ ] `skip`: emit discovery metadata, stop traversal at that node, and do not traverse children.
- [ ] `todo`: emit discovery metadata, continue descendant traversal, and suppress the node's own outcome significance.
- [ ] Stop traversal cleanly when a branch becomes unreachable.
- [ ] Return control to the host after branch pruning without corrupting local traversal state.

## Node Execution

- [ ] Honor `todo` by suppressing self-outcome significance without preventing descendant discovery.
- [ ] Surface traps and unreachable conditions to the host without classifying final failure on the Wasm side.

## Hooks and Lifecycle

- [ ] Allow failure metadata emission from inside lifecycle callbacks.
- [ ] Propagate unreachable conditions from lifecycle callbacks back to the host as callback failure.

## Assertion Bridge

- [ ] Ensure assertion failures behave the same inside node callbacks and lifecycle callbacks.

## Events and Encoding

- [ ] Write protocol notes that the host can implement without AssemblyScript-specific knowledge.

## ABI Boundary

- [ ] Decide whether scheduler-step entrypoints are required now or deferred.
- [ ] Keep the ABI simple, flat, and language-agnostic.

## Ephemeral Runtime State

- [ ] Implement attempt-local tracking for the active node path.
- [ ] Track current hook phase during lifecycle execution.
- [ ] Track the current traversal target.
- [ ] Maintain per-traversal child discovery buffers.
- [ ] Maintain temporary replay state needed to rediscover branches.
- [ ] Reset ephemeral state cleanly between attempts so the host remains the durable source of truth.

## Contracts, Fixtures, and Verification

- [ ] Write a module-by-module contract for `api`, `registry`, `traversal`, `executor`, `hooks`, `assert_bridge`, `events`, `abi`, and `state`.
- [ ] For each module, define inputs, outputs, owned state, and forbidden decisions.
- [ ] Add fixtures that cover deterministic rediscovery for nested `describe` and `test` trees.
- [ ] Add fixtures that prove `skip` prevents subtree traversal.
- [ ] Add fixtures that prove `todo` preserves descendant traversal while suppressing self-outcome significance.
- [ ] Add fixtures for lifecycle ordering and lifecycle failure propagation.
- [ ] Add fixtures for unreachable branch pruning and clean replay after failure.
