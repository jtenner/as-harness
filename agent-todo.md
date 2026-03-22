# Harness Todo

## v0.4.0

### Blockers

- ship explicit snapshot update mode plus transform-backed declaration file
  markers before exposing public `uvu/assert` artifact helpers.

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

- `ss-006`: add an explicit snapshot update mode.
  Ship a CLI flag such as `--update-snapshots` so missing or mismatched entries
  can be rewritten intentionally using the same export-map serializer, while
  ordinary runs stay read-only and fail on drift.

### Adapter: `uvu` Snapshot Helpers

- `ss-007`: add a transform-backed declaration file marker.
  Inject a lightweight helper call that records the declaring source file for
  test, suite, and hook execution frames so artifact helpers always resolve
  against the active stack descriptor rather than process cwd.
- `ss-008`: ship `uvu/assert` `snapshot(...)` on top of the shared artifact
  runtime.
  Start with reflected-value serialization plus host-side snapshot matching and
  update support.
- `ss-009`: ship `uvu/assert` `fixture(...)` on top of the same artifact
  runtime.
  Resolve fixture paths through the active descriptor and reject path escapes
  outside the project-owned artifact roots.

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
- `ss-010`: add shared runtime proof for snapshot stack push/pop discipline.
  Prove descriptor frames survive normal execution, nested helper calls, and
  trapped callbacks without leaking stale stack state into later targeted runs.
- `ss-011`: add shared and CLI proof for snapshot preload and stale-entry
  failure semantics.
  Cover missing, matched, mismatched, unmatched, and update-mode flows through
  the shipped reporter and all three hosts.
