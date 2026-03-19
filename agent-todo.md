# Harness Todo

## v0.3.0

### Blockers

- Stable Test Identity and Declaration Metadata
- Graph-Aware Scheduling Semantics
- Host Contract and Runner Reshape
- Native `as-harness` Adapter Surface
- Proof and Verification Matrix

### Risks

- stable IDs now drive discovery and planning, but execution still targets
  `NodeIndex`, so future dependency/reporting work must keep declaration
  identity authoritative while treating the path only as the replay handle
- `start()` now executes the discovered graph through one shared worker in
  deterministic order, so future worker-aware parallelism will need a separate
  scheduler/executor design once dependency and blocked-outcome semantics are
  pinned down
- `sequenceMode` now lowers onto runnable-test ordering rather than top-level
  branch barriers, and the shared planner now has direct proof coverage while
  `only`, expected-failure intent, and dependency node IDs now cross discovery
  cleanly, and the shared executor now suppresses blocked dependents before
  they run, and `wazero` now uses the shared `start()` contract in-band with
  working coverage snapshots, and `node:test` now exposes chainable
  dependency handles with guest-declared metadata proved through discovery and
  `start()`, and guest-declared failing, skip, todo, expected-failure, and
  `only`-filtered prerequisites now exercise real blocked/planning paths, but
  that dependency policy is still not yet documented as a stable public
  contract
- graph scheduling is host-planner work, not just adapter API work, so the ABI,
  host types, and reporting contract will all move together
- a native dependency API will be unstable if it lands before shared identity
  and blocked-outcome semantics are pinned down
- the main regressions here will be semantic and ordering-related, so weak
  proof coverage will hide real scheduler bugs

### Stable Test Identity and Declaration Metadata

Remaining work:

- make host planning and reporter-facing lookups prefer discovered declaration
  identity while keeping `nodeIndex` only as the traversal target
- decide which remaining graph fields beyond the now-exposed stable IDs,
  declaration order, sequence mode, `only`, expected-failure intent, and
  dependency node IDs must cross the Wasm ABI, host-runner types, CLI JSON
  output, and reporter surfaces

### Graph-Aware Scheduling Semantics

Remaining work:

- decide the exact meaning of `dependsOn(...)` outcomes: pass-through on
  success, blocked-on-failure behavior, transitive handling for blocked
  prerequisites, and whether any future soft-prerequisite mode is desirable
- document the current blocked-vs-skipped distinction as the intended public
  dependency policy for `v0.3.0`, not just a planner implementation detail
- define cycle detection, missing-dependency handling, duplicate-edge collapse,
  and deterministic tie-breaking between otherwise ready nodes

### Host Contract and Runner Reshape

Remaining work:

- keep the new module-global `start()` scheduler aligned with future explicit
  dependency edges and blocked outcomes instead of letting executor details
  leak back into adapters
- document the updated host-runner and ABI contracts once the stable-ID and
  graph-metadata shapes are chosen
- prove the now-updated host contract through non-JS hosts and CLI-facing
  blocked/planning paths
- decide whether any host besides `js` should use the worker-thread execution
  path, or whether in-band shared execution is the honest cross-host contract
  for `v0.3.0`
- decide whether targeted replay stays as the execution primitive for `v0.3.0`
  or whether scheduler-step entrypoints need to return earlier than previously
  planned

### Native `as-harness` Adapter Surface

Remaining work:

- design an ergonomic native declaration surface for sequential groups that
  lowers cleanly onto shared graph metadata
- carry the returned-handle dependency API from the current `node:test`
  surface into a future native `"as-harness"` adapter without forcing thin
  framework adapters to own scheduler logic
- keep thin framework adapters thin by mapping their declaration metadata into
  the shared scheduler model instead of duplicating scheduling logic in
  adapter-specific code
- define the minimum reporter and diagnostic wording needed when user-declared
  graph constraints are invalid

### Proof and Verification Matrix

Remaining work:

- add host-level scheduler tests for broader topological ordering,
  declaration-order tie-breaking, blocked propagation, and prerequisite-outcome
  handling now that missing dependencies, cycle detection, and prerequisite
  satisfaction have pure proof
- extend CLI-facing and true guest-declared cross-host proof from dependency
  metadata visibility into planner usage so stable IDs, declaration order,
  dependency node IDs, and the new planning/blocked result fields are
  exercised by real scheduler-facing paths
- add CLI and end-to-end blocked/planning smoke coverage for sequential groups
  across `js`, `wazero`, and `wasmtime`
- keep the root `bun run test` and source-host verification scripts aligned
  with the actual per-host smoke commands so host regressions cannot hide
  behind wrapper scripts
- keep bounded regression coverage and failure diagnostics around packaged CLI
  verification so hosted/package failures distinguish verifier supervision bugs
  from real bundled-host hangs
- prove that `only`, `skip`, `todo`, and expected-failure semantics interact
  with dependency planning exactly as documented
- add regression coverage that shows graph-aware scheduling does not duplicate
  work or mutate durable node metadata across repeated `start()` calls
