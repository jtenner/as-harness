# Assembly Package Buildout Tasks

Scope: `assembly/` only. This checklist covers the Wasm-side runtime defined in `docs/primary-buildout.md` and excludes host orchestration work.

## Framework Library Entry Points and Declaration Adapters

- [ ] Create framework-specific library entry-point folders under `assembly/assembly/` for:
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
- [ ] Treat each folder as an AssemblyScript `--lib` entry point rather than a generic public API surface.
- [ ] Define the exported declarations each framework entry point must provide to match that framework's test-definition surface.
- [ ] Map each framework's declaration surface onto shared internal representations for `test`, `describe`, `skip`, `todo`, hooks, and assertion integration.
- [ ] Route the shared internal declaration representations through WebAssembly imports as required by the current design.
- [ ] Standardize the metadata captured by every adapter at declaration time: node kind, name, declaration mode, callback reference, and parent scope context.
- [ ] Keep framework-specific naming, overloads, and convenience signatures inside the adapter folders instead of spreading them into the shared runtime.
- [ ] Define how assertion-oriented entry points such as `node:assert` integrate with the shared assertion bridge.
- [ ] Document the boundary between framework adapter code and the shared Wasm runtime so the adapters stay thin and deterministic.

## Registry and Discovery

- [ ] Implement root registration during module initialization.
- [ ] Implement active parent-scope tracking for nested declarations.
- [ ] Attach child nodes to the correct parent deterministically.
- [ ] Assign deterministic child ordinals within each scope.
- [ ] Define and compute `NodeIndex` values for roots and descendants.
- [ ] Preserve node kind, display name, declaration mode, and parent linkage for replay.
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

- [ ] Define the minimal assertion primitive the runtime exposes to assertion libraries.
- [ ] Implement `FailMessage` emission before intentional failure when a message exists.
- [ ] Support message-less assertion failure paths.
- [ ] Ensure assertion failures behave the same inside node callbacks and lifecycle callbacks.
- [ ] Normalize assertion failure into "emit metadata, then become unreachable".

## Events and Encoding

- [ ] Define the binary wire format for `NodeFound`, `NodeStart`, `NodePass`, `FailMessage`, `CallbackStart`, and `CallbackPass`.
- [ ] Define the packed encoding for `NodeIndex`.
- [ ] Encode names and failure messages as UTF-8.
- [ ] Implement event writing through imported host sinks or an equivalent shared transport boundary.
- [ ] Keep the format flat, portable, and independent of AssemblyScript object layout.
- [ ] Write protocol notes that the host can implement without AssemblyScript-specific knowledge.

## ABI Boundary

- [ ] Define exports for root discovery.
- [ ] Define exports for targeted traversal.
- [ ] Decide whether scheduler-step entrypoints are required now or deferred.
- [ ] Define the imported host functions needed for event transport and runtime services.
- [ ] Keep the ABI simple, flat, and language-agnostic.
- [ ] Ensure no AssemblyScript object references leak across the Wasm boundary.

## Ephemeral Runtime State

- [ ] Implement attempt-local tracking for active parent scope.
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
