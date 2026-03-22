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
- the remaining upstream `uvu/assert` helpers stay intentionally out of this
  cycle because they need constructor-aware contracts, shared partial-match
  semantics, or host-backed artifact I/O that the current guest/runtime model
  does not provide.
- guest-provided orchestration metadata can easily blur into guest-owned
  scheduling if the ABI grows new scheduler entrypoints instead of staying on
  discovery metadata plus host-owned `start()`.

### Runtime: Shared Guest Constraints

- keep `sequenceMode` and `dependencyNodeIds` as the authoritative shared
  constraint model.
- decide whether any new constraint fields are needed beyond the current
  sequential and dependency machinery.
- preserve declaration-order tie-breaking and same-machine ready-work fanout
  after constraint lowering.

### Adapter: `uvu`

- finish the remaining low-risk `uvu/assert` runtime-type helper:
  `instance(...)` and `not.instance(...)`.
- keep the shipped sync `uvu` builder surface stable:
  `test(...)`, top-level `test.before.each(...)` / `test.after.each(...)`,
  `suite(...)`, suite-builder `.test(...)`, `.only(...)`, `.skip(...)`,
  `.before(...)`, `.after(...)`, `.beforeEach(...)`, `.afterEach(...)`,
  `.run()`, and `exec(...)`.
- freeze the current builder-object divergence as the permanent `uvu` contract
  unless the repo later adopts a transform-backed rewrite policy.
- keep crumb/context callback parity and async behavior deferred until the
  higher-level compatibility decision is settled.
- keep artifact-backed `snapshot(...)` / `fixture(...)` and upstream
  `Assertion` object parity deferred until the repo ships explicit persisted
  artifact or adapter-local error-object contracts.

### Proof

- keep `js`, `wazero`, and `wasmtime` parity proof in place as adapters start
  lowering framework-shaped controls onto the shared hint model.
