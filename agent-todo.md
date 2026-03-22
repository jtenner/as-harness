# Harness Todo

## v0.3.0

### Blockers

- packaged `bun-linux-x64` verification still hangs in the bundled `wazero`
  createHarness path on GitHub Ubuntu after toolchain setup succeeds.

### Risks

- future scheduler changes are mostly semantic and order-related, so proof density
  still matters.
- CI and release native-host verification is pinned to current upstream Go/Rust
  stable releases, so external toolchain rollovers still need explicit baseline
  refreshes here.
