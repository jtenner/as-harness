# Harness Todo

## v0.3.0

### Blockers

- None currently tracked.

### Risks

- future scheduler changes are mostly semantic and order-related, so proof density
  still matters.
- Linux `wazero` worker-thread execution remains opt-in until the native hosted-runner
  path is stable enough to make the parallel mode the default again.
