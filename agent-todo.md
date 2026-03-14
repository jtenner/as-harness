# Harness Buildout Tasks

Primary scope: `assembly/`. This checklist covers the Wasm-side runtime defined in `docs/primary-buildout.md` and excludes host orchestration work, except where noted for supporting compiler-side transform machinery.

## Strict Equality Machinery

Cross-package scope: `cli/transform`, `assembly/`, and `docs/strict-equality-machinery.md`.

### Planning and Contracts

- [x] Write a design document for strict equality and reflected diagnostics in `docs/strict-equality-machinery.md`.
- [x] Define the first-pass behavioral contract for `node:assert.deepEqual(...)`.
- [x] Decide whether the first implementation targets `deepEqual`, `deepStrictEqual`, or a shared structural core with assertion-level wrappers.
- [x] Define the exact runtime comparison result model, including whether to use a tri-state result such as match / fail / defer.
- [x] Define which AssemblyScript value categories are supported in v1:
- [x] primitives
- [x] nullable references
- [x] strings
- [x] arrays / `StaticArray`
- [x] typed arrays / `ArrayBufferView`
- [x] `ArrayBuffer`
- [x] `Map`
- [x] `Set`
- [x] managed classes
- [x] function references
- [x] Define cycle-handling semantics for recursive reference graphs.
- [x] Define inheritance semantics for class-field comparison and reflected reporting.
- [x] Define the boundary between transform-generated methods and shared AssemblyScript runtime helpers.

### CLI Transform Scaffolding

- [x] Scaffold `cli/transform/` for strict-equality transform work.
- [x] Add a CLI-side transform entrypoint that can be passed into the AssemblyScript compiler wrapper.
- [x] Decide how the compiler wrapper will enable the transform for selected virtual-library entry points.
- [x] Document transform activation and build/debug workflow in `cli/README.md`.

### AST Traversal and Class Instrumentation

- [x] Traverse parser sources after parse and recursively inspect nested namespaces.
- [x] Identify every AssemblyScript `ClassDeclaration` that requires strict-equality instrumentation.
- [x] Inject a generated instance method for structural comparison on instrumented classes.
- [x] Define the generated method signature and parameter contract for the structural comparison hook.
- [x] Enumerate instance fields that should participate in structural comparison.
- [x] Enumerate instance getters that should participate in structural comparison.
- [x] Decide whether methods, static members, and computed members are excluded from generated comparison hooks.
- [x] Handle generic classes without losing generic context in generated methods.
- [x] Handle inheritance by delegating into `super` without double-comparing overridden members.
- [x] Decide how property-identity hashing or equivalent ignore-listing will be represented in generated code.

### Reflected Diagnostics Instrumentation

- [x] Inject a generated instance method for reflected key/value extraction on instrumented classes.
- [x] Define the generated method signature and parameter contract for reflected extraction.
- [x] Reuse the same field/getter selection rules between strict equality and reflected diagnostics.
- [x] Handle inheritance for reflected extraction without duplicating overridden members.
- [ ] Decide whether reflected extraction must support custom display overrides in v1 or later.

### Assembly Runtime Equality Core

- [x] Add a shared AssemblyScript runtime module for structural equality.
- [x] Implement fast-path primitive equality checks.
- [x] Define null-handling behavior for nullable reference comparisons.
- [x] Normalize `NaN` comparison semantics if float support requires it.
- [ ] Implement pair-cache tracking for already-proven reference matches.
- [ ] Implement active-resolution stack tracking for recursive comparison.
- [ ] Define and implement deferred-match behavior for cycles.
- [ ] Implement specialized comparison for `ArrayBuffer`.
- [ ] Implement specialized comparison for arrays and arraylikes.
- [ ] Implement specialized comparison for typed arrays / `ArrayBufferView`.
- [ ] Implement specialized comparison for `Set`.
- [ ] Implement specialized comparison for `Map`.
- [ ] Implement function-reference comparison semantics.
- [ ] Delegate generic class comparison into the transform-generated structural hook.

### Assembly Runtime Reflected Value Core

- [ ] Add a shared AssemblyScript runtime module for reflected-value construction.
- [ ] Define the reflected-value type model needed for assertion diagnostics.
- [ ] Implement primitive reflected values.
- [ ] Implement reflected values for strings.
- [ ] Implement reflected values for `ArrayBuffer`.
- [ ] Implement reflected values for arrays and arraylikes.
- [ ] Implement reflected values for typed arrays / `ArrayBufferView`.
- [ ] Implement reflected values for `Set`.
- [ ] Implement reflected values for `Map`.
- [ ] Implement reflected values for managed classes via the transform-generated reflection hook.
- [ ] Define whether stack traces or source context attach to reflected values in v1 or later.

### Assertion Bridge Integration

- [ ] Add a `node:assert` internal entry point that can call the structural equality runtime.
- [ ] Define how failed structural equality lowers into `FailMessage` plus trap.
- [ ] Decide whether default deep-equality failure messages are generated in the guest, in the host, or deferred.
- [ ] Ensure the strict-equality runtime can be reused by future assertion APIs beyond `deepEqual`.

### Compiler Wrapper Integration

- [x] Extend the compiler wrapper to register the new transform when compiling harness-aware AssemblyScript modules.
- [ ] Ensure bundled virtual AssemblyScript sources can reference the transform-generated runtime hooks safely.
- [x] Decide whether transform enablement is always-on for harness builds or gated by adapter selection.
- [ ] Add debug output or inspection hooks so generated methods can be audited during development.

### Fixtures and Verification

- [x] Add transform-level fixtures that prove classes receive generated comparison hooks.
- [x] Add transform-level fixtures that prove classes receive generated reflected-value hooks.
- [x] Add fixtures for inherited fields and overridden getters.
- [x] Add fixtures for generic classes.
- [ ] Add runtime equality fixtures for primitives, nullability, arrays, typed arrays, maps, sets, and classes.
- [ ] Add cycle fixtures that prove recursive graphs terminate cleanly.
- [ ] Add diagnostics fixtures that prove reflected class key/value extraction matches the generated member list.
- [ ] Add `node:assert.deepEqual(...)` fixtures only after the structural core is stable.

## Framework Library Entry Points and Declaration Adapters

- [x] Create framework-specific library entry-point folders under `assembly/assembly/` for:
- [ ] `node:test`
- [ ] `jest`
- [ ] `mocha`
- [ ] `vitest`
- [ ] `ava`
- [ ] `tap`
- [ ] `tape`
- [ ] `uvu`
- [ ] `jasmine`
- [ ] `qnit`
- [ ] `node:assert`
- [x] Treat each folder as an AssemblyScript `--lib` entry point rather than a generic public API surface.
- [ ] Define the exported declarations each framework entry point must provide to match that framework's test-definition surface.
- [ ] Map each framework's declaration surface onto shared internal representations for `test`, `describe`, `skip`, `todo`, hooks, and assertion integration.
- [ ] Route the shared internal declaration representations through WebAssembly imports as required by the current design.
- [ ] Standardize the metadata captured by every adapter at declaration time: node kind, name, declaration mode, callback reference, and parent scope context.
- [ ] Keep framework-specific naming, overloads, and convenience signatures inside the adapter folders instead of spreading them into the shared runtime.
- [ ] Define how assertion-oriented entry points such as `node:assert` integrate with the shared assertion bridge.
- [ ] Document the boundary between framework adapter code and the shared Wasm runtime so the adapters stay thin and deterministic.

## Registry and Discovery

- [ ] Implement root registration during module initialization.
- [x] Implement active parent-scope tracking for nested declarations.
- [x] Attach child nodes to the correct parent deterministically.
- [x] Assign deterministic child ordinals within each scope.
- [ ] Define and compute `NodeIndex` values for roots and descendants.
- [x] Preserve node kind, display name, declaration mode, and parent linkage for replay.
- [ ] Ensure nested declarations made during callback execution attach to the active traversal scope rather than a stale registration scope.

## Traversal and Replay

- [ ] Define the targeted traversal input contract for replaying toward a requested node path.
- [ ] Implement replay starting from roots and re-entering ancestors as needed.
- [ ] Rediscover nodes in deterministic order on every replay attempt.
- [ ] Emit `NodeFound` during discovery for every structurally visible node.
- [ ] Enforce declaration-mode traversal semantics:
- [ ] `skip`: emit discovery metadata, stop traversal at that node, and do not traverse children.
- [ ] `todo`: emit discovery metadata, continue descendant traversal, and suppress the node's own outcome significance.
- [ ] Stop traversal cleanly when a branch becomes unreachable.
- [ ] Return control to the host after branch pruning without corrupting local traversal state.

## Node Execution

- [ ] Implement runnable execution for `describe` and `test` callbacks.
- [ ] Emit `NodeStart` before callback execution begins.
- [ ] Emit `NodePass` only after successful callback completion.
- [ ] Allow nested declarations during callback execution.
- [ ] Preserve enough execution context to support parent-aware child discovery.
- [ ] Honor `todo` by suppressing self-outcome significance without preventing descendant discovery.
- [ ] Surface traps and unreachable conditions to the host without classifying final failure on the Wasm side.

## Hooks and Lifecycle

- [ ] Define lifecycle registration for `beforeAll`, `beforeEach`, `afterEach`, and `afterAll`.
- [ ] Associate lifecycle callbacks with the correct structural scope.
- [ ] Define the exact execution order for lifecycle callbacks relative to traversal and node execution.
- [ ] Emit `CallbackStart` before each lifecycle callback runs.
- [ ] Emit `CallbackPass` after successful lifecycle completion.
- [ ] Allow failure metadata emission from inside lifecycle callbacks.
- [ ] Propagate unreachable conditions from lifecycle callbacks back to the host as callback failure.

## Assertion Bridge

- [x] Define the minimal assertion primitive the runtime exposes to assertion libraries.
- [ ] Implement `FailMessage` emission before intentional failure when a message exists.
- [ ] Support message-less assertion failure paths.
- [ ] Ensure assertion failures behave the same inside node callbacks and lifecycle callbacks.
- [ ] Normalize assertion failure into "emit metadata, then become unreachable".

## Events and Encoding

- [x] Define the binary wire format for `NodeFound`, `NodeStart`, `NodePass`, `FailMessage`, `CallbackStart`, and `CallbackPass`.
- [x] Define the packed encoding for `NodeIndex`.
- [x] Encode names and failure messages as UTF-8.
- [x] Implement event writing through imported host sinks or an equivalent shared transport boundary.
- [x] Keep the format flat, portable, and independent of AssemblyScript object layout.
- [ ] Write protocol notes that the host can implement without AssemblyScript-specific knowledge.

## ABI Boundary

- [ ] Define exports for root discovery.
- [ ] Define exports for targeted traversal.
- [ ] Decide whether scheduler-step entrypoints are required now or deferred.
- [x] Define the imported host functions needed for event transport and runtime services.
- [ ] Keep the ABI simple, flat, and language-agnostic.
- [x] Ensure no AssemblyScript object references leak across the Wasm boundary.

## Ephemeral Runtime State

- [x] Implement attempt-local tracking for active parent scope.
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
- [ ] Add fixtures for nested declaration during execution.
- [ ] Add fixtures for lifecycle ordering and lifecycle failure propagation.
- [ ] Add fixtures for assertion failures with and without messages.
- [ ] Add fixtures for unreachable branch pruning and clean replay after failure.
