# Harness Todo

## v0.3.0

### Blockers

- Graph-aware scheduling semantics
  - make stable node identity real in shared discovery/planning inputs
  - capture declaration-order and sequence metadata during discovery
  - write and keep pure host-side graph planner tests for:
    - topological ordering with declaration-order tie-breaking
    - sequential-group lowering
    - duplicate-edge collapse
    - cycle detection
    - missing dependency detection
    - blocked propagation
    - `fails` prerequisite satisfaction rules
    - `only`, `skip`, and `todo` interaction rules
  - extend host event/type decoding so stable IDs and planner metadata survive replay
  - switch `start()` to module-global graph planning instead of branch-local execution assumptions
  - add blocked/cycle/missing-dependency reporting semantics to the shared result shape
  - prove the graph planner through `js`, `wazero`, and `wasmtime` integration tests
- Host contract and runner reshape
- Native `as-harness` adapter surface

### Risks

- native dependency APIs are risky before stable IDs and blocked semantics are finalized.
- remaining regressions are mostly semantic/order-related, so proof density is important.

### Host Contract and Runner Reshape

- Keep `CHANGELOG.md`/release notes ready for API-visible contract changes

### Native `as-harness` Adapter Surface

- Design native sequential-group declaration surface that maps to shared metadata only
- Carry chainable `dependsOn(...)` declarations into shared scheduler inputs, no adapter-local logic
- Define concise reporter copy for blocked/cycle/missing-dependency outcomes
