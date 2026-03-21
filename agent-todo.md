# Harness Todo

## v0.3.0

### Blockers

- Graph-aware scheduling semantics
- Host contract and runner reshape
- Native `as-harness` adapter surface

### Risks

- `start()` is deterministic and shared, but worker-aware parallelism is intentionally out of scope.
- `sequenceMode`, dependency metadata, and failed outcomes now have shared coverage and docs updates, but host planner behavior still needs full coverage for all edge cases.
- native dependency APIs are risky before stable IDs and blocked semantics are finalized.
- remaining regressions are mostly semantic/order-related, so proof density is important.

### Graph-Aware Scheduling Semantics

### Host Contract and Runner Reshape

- Decide module-global scheduling contract shape now (same-machine parallelism vs fully deterministic baseline)
- Update `harness/shared/harness-types.d.ts`-backed host contract text with any scheduling-policy deltas
- Align `cli`, `harness/*`, and reporter outputs with planner fields before the next commit
- Keep `CHANGELOG.md`/release notes ready for API-visible contract changes

### Native `as-harness` Adapter Surface

- Design native sequential-group declaration surface that maps to shared metadata only
- Carry chainable `dependsOn(...)` declarations into shared scheduler inputs, no adapter-local logic
- Define concise reporter copy for blocked/cycle/missing-dependency outcomes
