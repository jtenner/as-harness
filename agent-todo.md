# Harness Todo

## v0.6.0

### Blockers

- decide the first supported host-owned hint scopes for `bail` and `in-band`
  execution so planner behavior is deterministic across `js`, `wazero`, and
  `wasmtime`.

### Risks

- shipped `uvu` intentionally diverges from upstream callable returned suite
  objects because current AssemblyScript cannot model a callable object with
  attached methods cleanly; closing that gap would require a transform or some
  broader source-rewrite policy.
- shipped `uvu` callbacks still use shared `TestContext` rather than upstream
  crumb/context objects, so strict source parity remains incomplete even though
  the sync declaration slice now ships.
- guest-provided orchestration metadata can easily blur into guest-owned
  scheduling if the ABI grows new scheduler entrypoints instead of staying on
  discovery metadata plus host-owned `start()`.

### Runtime: Shared Guest Hints

- update the guest/runtime/host ABI docs so hint ownership boundaries are
  explicit and stable.
- implement first-pass host fallback and scope semantics for
  `preferredFailurePolicy` and `preferredRunnerMode` now that the shared
  metadata fields ship end to end through discovery.

### Runtime: Shared Guest Constraints

- keep `sequenceMode` and `dependencyNodeIds` as the authoritative shared
  constraint model.
- decide whether any new constraint fields are needed beyond the current
  sequential and dependency machinery.
- validate unsupported or malformed constraints as planner issues instead of
  silently ignoring them.
- preserve declaration-order tie-breaking and same-machine ready-work fanout
  after constraint lowering.

### Runtime: Host Planner

- teach `harness/shared/start.cjs` to read guest hints while keeping the host
  as the sole planner and execution orchestrator.
- implement first-pass host handling for `bail` hints with a clearly scoped
  subtree or branch boundary.
- implement first-pass host handling for `in-band` hints so selected work stays
  off worker fanout while unrelated ready work can still parallelize when safe.
- document deterministic fallback behavior when unsupported hints are ignored.
- keep `start().metadata`, blocked reporting, and plan issue semantics coherent
  after hint-aware planning lands.

### Runtime: Native Guest APIs

- decide whether any additional native declaration helpers are needed beyond
  the shipped chainable handle methods plus `SuiteContext` / `TestContext`
  `inBand(...)`, `bail(...)`, and `continueOnFailure(...)`.

### Adapter: `vitest`

- map `vitest` scheduling-shaped controls onto the shared host constraint and
  hint model rather than adapter-local execution.
- keep `sequential` lowering aligned with the existing shared sequential
  constraint semantics.
- decide whether any current or future `vitest` controls should become shared
  hints rather than hard constraints in this cycle.
- extend `vitest` internal coverage and shared smoke proof for the selected
  constraint and hint slices.

### Adapter: `uvu`

- keep the shipped sync `uvu` builder surface stable:
  `test(...)`, top-level `test.before.each(...)` / `test.after.each(...)`,
  `suite(...)`, suite-builder `.test(...)`, `.only(...)`, `.skip(...)`,
  `.before(...)`, `.after(...)`, `.beforeEach(...)`, `.afterEach(...)`,
  `.run()`, and `exec(...)`.
- decide whether `uvu` should expose any new host-readable orchestration hints
  in this cycle, while keeping `.run()` and `exec(...)` as host-owned
  compatibility no-ops.
- decide whether strict upstream callable-suite compatibility is worth a
  transform-backed rewrite layer or whether the current builder-object
  divergence should be frozen as the permanent contract.
- add richer `uvu/assert` helpers that fit the current shared assertion and
  failure model before attempting async or upstream error-object parity.
- keep crumb/context callback parity and async behavior deferred until the
  higher-level compatibility decision is settled.

### Proof

- add shared planner tests for hint honoring, hint fallback, and invalid
  constraint diagnostics.
- add shared smoke proof showing guest-declared constraints still run through
  host-owned scheduling and worker-slot planning.
- add CLI proof for any user-visible hint or constraint effects on execution
  order, blocked runs, or failure summarization.
- keep `js`, `wazero`, and `wasmtime` parity proof in place for all new
  planner behavior.

### Docs

- update [docs/006-2026-03-17-guest-runtime-contracts.md](/home/jtenner/Projects/as-harness/docs/006-2026-03-17-guest-runtime-contracts.md),
  [docs/007-2026-03-17-host-runner-contract.md](/home/jtenner/Projects/as-harness/docs/007-2026-03-17-host-runner-contract.md),
  and [docs/003-2026-03-17-harness-abi.md](/home/jtenner/Projects/as-harness/docs/003-2026-03-17-harness-abi.md)
  for the new hint and constraint metadata once implemented.
- keep [docs/015-2026-03-22-guest-hint-and-constraint-plan.md](/home/jtenner/Projects/as-harness/docs/015-2026-03-22-guest-hint-and-constraint-plan.md)
  as the current design note for this dev-cycle work.
