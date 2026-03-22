# Harness Todo

## v0.6.0

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

### Runtime: Shared Guest Constraints

- keep `sequenceMode` and `dependencyNodeIds` as the authoritative shared
  constraint model.
- decide whether any new constraint fields are needed beyond the current
  sequential and dependency machinery.
- validate unsupported or malformed constraints as planner issues instead of
  silently ignoring them.
- preserve declaration-order tie-breaking and same-machine ready-work fanout
  after constraint lowering.

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
- freeze the current builder-object divergence as the permanent `uvu` contract
  unless the repo later adopts a transform-backed rewrite policy.
- continue expanding `uvu/assert` only where helpers map cleanly onto the
  shared assertion and trap model; the remaining open gap is `instance`,
  `snapshot`, `fixture`, `match`, `Assertion`, and any negated forms that
  depend on those helpers.
- keep crumb/context callback parity and async behavior deferred until the
  higher-level compatibility decision is settled.

### Proof

- keep `js`, `wazero`, and `wasmtime` parity proof in place as adapters start
  lowering framework-shaped controls onto the shared hint model.
