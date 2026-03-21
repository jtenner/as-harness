# Harness Todo

## v0.3.0

### Blockers

- Graph-aware scheduling semantics
  - make stable node identity real in shared discovery/planning inputs
  - capture declaration-order and sequence metadata during discovery
  - extend host event/type decoding so stable IDs and planner metadata survive replay
  - switch `start()` to module-global graph planning instead of branch-local execution assumptions
  - prove the graph planner through `js`, `wazero`, and `wasmtime` integration tests

### Risks

- remaining regressions are mostly semantic/order-related, so proof density is important.
