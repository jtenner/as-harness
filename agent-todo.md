# Harness Todo

## v0.3.0

### Blockers

- Stable Test Identity and Declaration Metadata
- Graph-Aware Scheduling Semantics
- Host Contract and Runner Reshape
- Native `as-harness` Adapter Surface
- Proof and Verification Matrix

### Risks

- stable IDs now cross discovery events and host node snapshots, but `start()`
  planning still executes by `NodeIndex`, so graph-aware scheduling can still
  drift until the host lowers ordering and dependency constraints onto the
  discovered declaration graph instead of branch-local run lists
- the current branch-worker `start()` orchestration is incompatible with
  cross-branch dependency edges unless scheduling becomes global or graph scope
  is constrained
- `sequenceMode` now crosses the guest and host boundary and top-level
  sequential branches act as execution barriers, but the scheduler still
  serializes too broadly inside mixed branches until it lowers sequential
  intent onto runnable tests instead of branch stages
- graph scheduling is host-planner work, not just adapter API work, so the ABI,
  host types, and reporting contract will all move together
- a native dependency API will be unstable if it lands before shared identity
  and blocked-outcome semantics are pinned down
- the main regressions here will be semantic and ordering-related, so weak
  proof coverage will hide real scheduler bugs

### Stable Test Identity and Declaration Metadata

Remaining work:

- extend shared declaration metadata to capture declaration order, parent
  identity, `only`, expected-failure intent, and future dependency metadata
  without making adapter code own scheduler logic
- make host planning and reporter-facing lookups prefer discovered declaration
  identity while keeping `nodeIndex` only as the traversal target
- decide which remaining graph fields beyond the now-exposed stable IDs,
  declaration order, and sequence mode must cross the Wasm ABI, host-runner
  types, CLI JSON output, and reporter surfaces

### Graph-Aware Scheduling Semantics

Remaining work:

- define the first shared ordering model for plain declaration order,
  sequential groups, and explicit dependency edges
- replace the current top-level sequential branch barriers with minimal
  ordering constraints over only the affected runnable nodes
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
- extend the harness host types and decoded event objects with any remaining
  graph metadata required by reporters or external hosts beyond the now-exposed
  stable IDs, declaration order, and sequence mode
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

- add host-level scheduler tests for topological ordering, declaration-order
  tie-breaking, cycle detection, missing dependencies, and blocked propagation
- extend host and CLI proof from discovery visibility into planner usage so
  stable IDs and declaration order are exercised by scheduler-facing paths
- add CLI and end-to-end smoke coverage for sequential groups and explicit
  dependencies across `js`, `wazero`, and `wasmtime`
- prove that `only`, `skip`, `todo`, and expected-failure semantics interact
  with dependency planning exactly as documented
- add regression coverage that shows graph-aware scheduling does not duplicate
  work or mutate durable node metadata across repeated `start()` calls
