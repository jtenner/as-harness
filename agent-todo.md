# Harness Todo

## v0.3.0

### Blockers

- Graph-aware scheduling semantics
- Host contract and runner reshape
- Native `as-harness` adapter surface

### Risks

- `sequenceMode`, dependency metadata, and failed outcomes now have shared coverage and docs updates, but host planner behavior still needs full coverage for all edge cases.
- native dependency APIs are risky before stable IDs and blocked semantics are finalized.
- remaining regressions are mostly semantic/order-related, so proof density is important.

### Host Contract and Runner Reshape

- Keep `CHANGELOG.md`/release notes ready for API-visible contract changes

### Native `as-harness` Adapter Surface

- Design native sequential-group declaration surface that maps to shared metadata only
- Carry chainable `dependsOn(...)` declarations into shared scheduler inputs, no adapter-local logic
- Define concise reporter copy for blocked/cycle/missing-dependency outcomes
