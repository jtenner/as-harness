# Harness Todo

## v0.3.0

### Blockers

- Stable Test Identity and Declaration Metadata
- Graph-Aware Scheduling Semantics
- Host Contract and Runner Reshape
- Native `as-harness` Adapter Surface

### Risks

- repo-wide formatting now runs through `bun format`, `gofmt`, and `cargo fmt`,
  but Biome still cannot parse the two AssemblyScript sources that use
  top-level `@external(...)` declarations, so those files stay outside the
  current JS/TS formatter baseline until a compatible formatter path is added
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
  `only`-filtered prerequisites now exercise real blocked/planning paths, and
  repeated `start()` stability is now covered too, but broader scheduler proof
  is still not fully covered
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
- define cycle detection, missing-dependency handling, duplicate-edge collapse,
  and deterministic tie-breaking between otherwise ready nodes

### Host Contract and Runner Reshape

Remaining work:

- keep the new module-global `start()` scheduler aligned with future explicit
  dependency edges and blocked outcomes instead of letting executor details
  leak back into adapters
- keep the updated host-runner and README contracts aligned if dependency
  policy, blocked semantics, or adapter surfaces change again
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
