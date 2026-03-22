# Harness Todo

## v0.4.0

### Blockers

- ship public `uvu/assert` `snapshot(...)` before `fixture(...)` so the first
  artifact helper closes the shared persisted-snapshot contract end to end
  before path-reading helpers depend on it.

### Risks

- shipped `uvu` intentionally diverges from upstream callable returned suite
  objects because current AssemblyScript cannot model a callable object with
  attached methods cleanly; closing that gap would require a transform or some
  broader source-rewrite policy.
- shipped `uvu` callbacks still use shared `TestContext` rather than upstream
  crumb/context objects, so strict source parity remains incomplete even though
  the sync declaration slice now ships.
- shipping artifact-backed `uvu/assert` `snapshot(...)` / `fixture(...)`
  inside `v0.4.0` needs an explicit persisted-artifact contract that stays
  host-owned across `js`, `wazero`, and `wasmtime`.
- guest-provided orchestration metadata can easily blur into guest-owned
  scheduling if the ABI grows new scheduler entrypoints instead of staying on
  discovery metadata plus host-owned `start()`.

### Runtime: Snapshot Artifacts

- keep the shipped explicit snapshot update mode on the current contract:
  `--update-snapshots` is the only supported rewrite path, and normal runs stay
  read-only even after public snapshot helpers land.

### Adapter: `uvu` Snapshot Helpers

- `ss-008`: ship `uvu/assert` `snapshot(...)` on top of the shared artifact
  runtime.
  Finish the public helper wiring on top of the shared snapshot compare, path,
  and upsert support with reflected-value serialization plus host-side status
  reporting.
- `ss-009`: ship `uvu/assert` `fixture(...)` on top of the same artifact
  runtime.
  Finish the public helper wiring on top of the shared fixture path rules and a
  host-backed UTF-8 read ABI while still rejecting path escapes outside the
  project-owned artifact roots.

### Adapter: `uvu`

- keep the shipped sync `uvu` builder surface stable:
  `test(...)`, top-level `test.before.each(...)` / `test.after.each(...)`,
  `suite(...)`, suite-builder `.test(...)`, `.only(...)`, `.skip(...)`,
  `.before(...)`, `.after(...)`, `.beforeEach(...)`, `.afterEach(...)`,
  `.run()`, and `exec(...)`.
- freeze the current builder-object divergence as the permanent `uvu` contract
  unless the repo later adopts a transform-backed rewrite policy.
- keep crumb/context callback parity and async behavior deferred until the
  higher-level compatibility decision is settled.
- keep upstream `Assertion` object parity deferred until the repo ships an
  adapter-local error-object contract.

### Proof

- keep `js`, `wazero`, and `wasmtime` parity proof in place as adapters start
  lowering framework-shaped controls onto the shared hint model.
- `ss-011`: add shared and CLI proof for snapshot preload and stale-entry
  failure semantics.
  Cover missing, matched, mismatched, unmatched, and update-mode flows through
  the shipped reporter and all three hosts.
