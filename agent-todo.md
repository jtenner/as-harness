# Harness Todo

## v0.3.0

### Blockers

- Stable Test Identity and Declaration Metadata
- Graph-Aware Scheduling Semantics
- Host Contract and Runner Reshape
- Native `as-harness` Adapter Surface
- Proof and Verification Matrix

### Risks

- `NodeIndex` is not a stable graph identifier, so graph-aware scheduling can
  drift immediately if IDs are not fixed first
- the current branch-worker `start()` orchestration is incompatible with
  cross-branch dependency edges unless scheduling becomes global or graph scope
  is constrained
- graph scheduling is host-planner work, not just adapter API work, so the ABI,
  host types, and reporting contract will all move together
- a native dependency API will be unstable if it lands before shared identity
  and blocked-outcome semantics are pinned down
- the main regressions here will be semantic and ordering-related, so weak
  proof coverage will hide real scheduler bugs

### Stable Test Identity and Declaration Metadata

Remaining work:

- introduce stable opaque test and suite identifiers that are independent of
  `NodeIndex` and survive replay-driven rediscovery
- define the identifier contract: uniqueness within one module, deterministic
  assignment for deterministic declarations, and no dependence on `only`
  filtering or branch-worker partitioning
- decide whether stable IDs require durable declaration slots, replay-node
  reuse, or a different extraction path before more graph metadata lands
- extend shared declaration metadata to capture declaration order, parent
  identity, `only`, expected-failure intent, and future ordering or dependency
  flags without making adapter code own scheduler logic
- decide which identity fields must cross the Wasm ABI, host-runner types, CLI
  JSON output, and reporter surfaces

### Graph-Aware Scheduling Semantics

Remaining work:

- define the first shared ordering model for plain declaration order,
  sequential groups, and explicit dependency edges
- decide the exact meaning of `dependsOn(...)` outcomes: pass-through on
  success, blocked-on-failure behavior, and transitive handling for blocked
  prerequisites
- decide how `skip`, `todo`, `only`, and expected-failure nodes affect
  dependents and whether blocked tests need a first-class outcome distinct from
  skipped tests
- define cycle detection, missing-dependency handling, duplicate-edge collapse,
  and deterministic tie-breaking between otherwise ready nodes
- make the concurrency stance explicit for `v0.3.0`, likely keeping execution
  globally sequential while preserving metadata that can support future
  worker-aware scheduling

### Host Contract and Runner Reshape

Remaining work:

- redesign `start()` planning so execution order is derived from discovered
  graph metadata instead of independent branch-local test lists alone
- decide whether graph edges may cross top-level branches; if yes, replace
  branch-local worker scheduling with a module-global scheduler
- extend the harness host types and decoded event objects to carry stable IDs
  plus any graph metadata required by reporters or external hosts
- document the updated host-runner and ABI contracts once the stable-ID and
  graph-metadata shapes are chosen
- decide whether targeted replay stays as the execution primitive for `v0.3.0`
  or whether scheduler-step entrypoints need to return earlier than previously
  planned

### Native `as-harness` Adapter Surface

Remaining work:

- design an ergonomic native declaration surface for sequential groups that
  lowers cleanly onto shared graph metadata
- decide whether explicit dependencies use returned declaration handles, named
  refs, or another stable-ID-backed API
- keep thin framework adapters thin by mapping their declaration metadata into
  the shared scheduler model instead of duplicating scheduling logic in
  adapter-specific code
- define the minimum reporter and diagnostic wording needed when user-declared
  graph constraints are invalid

### Proof and Verification Matrix

Remaining work:

- add guest/internal tests that prove stable IDs and declaration-order metadata
  remain deterministic across repeated discovery and run replay
- add host-level scheduler tests for topological ordering, declaration-order
  tie-breaking, cycle detection, missing dependencies, and blocked propagation
- add CLI and end-to-end smoke coverage for sequential groups and explicit
  dependencies across `js`, `wazero`, and `wasmtime`
- prove that `only`, `skip`, `todo`, and expected-failure semantics interact
  with dependency planning exactly as documented
- add regression coverage that shows graph-aware scheduling does not duplicate
  work or mutate durable node metadata across repeated `start()` calls
