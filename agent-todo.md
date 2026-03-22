# Harness Todo

## v0.3.0

### Blockers

- None currently tracked.

### Risks

- future scheduler changes are mostly semantic and order-related, so proof density
  still matters.
- CI and release native-host verification is pinned to current upstream Go/Rust
  stable releases, so external toolchain rollovers still need explicit baseline
  refreshes here.
- bundled Linux `wazero` now forces the interpreter engine to avoid the hosted
  packaged createHarness hang, so future work should confirm whether the compiler
  engine can be restored safely.
