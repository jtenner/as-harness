# Harness Todo

## v0.3.0

### Blockers

- Stable Test Identity and Declaration Metadata
- Graph-aware scheduling semantics
- Host contract and runner reshape
- Native `as-harness` adapter surface

### Risks

- Biome cannot parse AssemblyScript files with top-level `@external(...)` imports yet, so those files are not fully formatter-covered.
- `NodeIndex` remains traversal-only while execution should move toward stable declaration IDs for planning and reporting.
- `start()` is deterministic and shared, but worker-aware parallelism is intentionally out of scope.
- `sequenceMode`, dependency metadata, and failed outcomes now have shared coverage and docs updates, but host planner behavior still needs full coverage for all edge cases.
- native dependency APIs are risky before stable IDs and blocked semantics are finalized.
- remaining regressions are mostly semantic/order-related, so proof density is important.

### Stable Test Identity and Declaration Metadata

Remaining:

- make planning/reporting prefer stable declaration identity and keep `NodeIndex` as traversal-only handle
- decide which extra graph fields must cross ABI, runner types, JSON output, and reports

### Graph-Aware Scheduling Semantics

Remaining:

- finalize `dependsOn(...)` outcome rules for failures, transitive blocking, and any soft-prerequisite mode

### Host Contract and Runner Reshape

Remaining:

- keep module-global scheduling aligned with future explicit dependencies
- keep host-runner contract and READMEs aligned as policies evolve

### Native `as-harness` Adapter Surface

Remaining:

- design a native sequential-group declaration surface that maps cleanly to shared metadata
- carry chainable `dependsOn(...)` behavior into `as-harness` without duplicating scheduler logic in adapters
- define reporter wording for invalid graph constraints
