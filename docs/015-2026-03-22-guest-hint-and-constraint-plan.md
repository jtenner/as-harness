# Guest Hint And Constraint Plan

This note answers how `as-harness` can let guests help orchestrate execution
without giving up host-owned scheduling, recommends a hybrid model based on
guest-declared hints plus host-enforced constraints, and defines the affected
work across `assembly/`, `harness/`, and `cli/`. The recommendation is to keep
`start()` as the single scheduler, add explicit guest-visible scheduling
metadata to the shared runtime, and let adapters such as `uvu` and `vitest`
lower framework-shaped controls into that shared metadata rather than running
their own scheduler in guest code.

## Short Recommendation

- keep scheduling on the host
- add guest-declared scheduling hints that are advisory only
- add guest-declared scheduling constraints that are binding once declared
- keep `discover()` and targeted `run(nodeIndex)` as the execution primitives
- do not let guest code decide when execution starts or which node runs next
- make `.run()` and `exec()` remain guest-side declaration finalizers or
  compatibility no-ops, not scheduler entrypoints

## Target Model

The host still does this:

1. discover structure
2. collect scheduling metadata
3. validate constraints
4. build the execution plan
5. execute ready work across worker slots
6. aggregate and report results

The guest may now contribute two kinds of metadata:

- hints: preferences that the host may ignore without changing correctness
- constraints: rules that the host must honor or reject with diagnostics

## Distinction: Hints Versus Constraints

### Hints

Hints are guest preferences about planning policy. They do not create
correctness dependencies.

Examples:

- prefer sequential execution for this scope
- prefer in-band execution for this branch
- prefer declaration-order execution within this group
- prefer a `bail`-style stop-after-first-failure policy for this local scope

Host rule:

- the scheduler may ignore a hint if the current runtime does not support it
- ignored hints should be observable in diagnostics only if the project decides
  that visibility is useful

### Constraints

Constraints affect correctness. They must be enforced by planning.

Examples:

- this test depends on that test
- these declarations form a sequential scope
- these children are mutually ordered even when siblings outside the scope are
  still parallelizable

Host rule:

- a constraint must either be honored or surfaced as a plan issue

## Proposed Shared Metadata Shape

Each discovered node should be able to expose planning metadata equivalent to:

```ts
type SchedulingMetadata = {
  sequenceMode: "inherit" | "sequential";
  dependencyNodeIds: number[];
  preferredRunnerMode: "default" | "in-band";
  preferredFailurePolicy: "inherit" | "continue" | "bail";
};
```

Only some of these are constraints today:

- `sequenceMode`
- `dependencyNodeIds`

Current decision for this cycle:

- keep `sequenceMode` and `dependencyNodeIds` as the only binding shared
  constraint fields
- do not add another constraint field until a concrete framework control fails
  to lower honestly onto those two

The rest are hints in the first slice:

- `preferredRunnerMode`
- `preferredFailurePolicy`

## ABI Direction

Keep the ABI host-owned and flat.

Recommended direction:

- continue emitting scheduling metadata through discovery facts
- do not add a guest-side `next()` or `plan()` export in this dev cycle
- if a new hint field is needed, add it to node discovery metadata rather than
  adding guest-owned scheduler entrypoints

Reason:

- this keeps `start()` authoritative
- this preserves parity across `js`, `wazero`, and `wasmtime`
- this avoids a split model where some adapters schedule inside guest code and
  some do not

## Proposed Work Breakdown

### Slice 1: Shared Constraint Vocabulary

Goal:

- define the shared metadata and planner semantics once

Needed work:

- extend guest node metadata to carry shared hint and constraint fields
- extend discovery payload decoding to surface that metadata to hosts
- keep current `sequenceMode` and dependency edges as the first-class
  constraint model
- add planner-side validation for any new constraint fields before execution

Files likely affected:

- `assembly/assembly/internal/api.ts`
- `assembly/assembly/internal/node.ts`
- `assembly/assembly/internal/events.ts`
- `assembly/assembly/internal/imports.ts`
- `harness/shared/harness-types.d.ts`
- `harness/shared/start.cjs`
- `docs/003-2026-03-17-harness-abi.md`
- `docs/006-2026-03-17-guest-runtime-contracts.md`
- `docs/007-2026-03-17-host-runner-contract.md`

Status:

- complete for this dev cycle without adding another shared constraint field

Decision:

- keep `sequenceMode` and `dependencyNodeIds` as the full binding shared
  constraint vocabulary for now

Reason:

- the shipped planner, adapter lowering, and diagnostics are already centered
  on those two fields
- adding another binding field without a concrete unmet framework need would
  widen the contract faster than the current proof surface justifies

### Slice 2: Host Planner Support For Guest Hints

Goal:

- let the guest request planning preferences while the host stays in charge

Needed work:

- teach `start()` planning to read guest hints
- define deterministic fallback rules when hints are ignored
- scope hints so they affect only the declaring suite or subtree
- keep result metadata and plan issues stable when hints are unsupported

First recommended hints:

- `preferredFailurePolicy = bail`
- `preferredRunnerMode = in-band`

Reason:

- both are meaningful orchestration requests
- both can remain host-owned
- neither requires guest-owned execution

Files likely affected:

- `harness/shared/start.cjs`
- `harness/shared/start.test.cjs`
- `harness/shared/start-planner-smoke.cjs`
- `harness/shared/harness-types.d.ts`

### Slice 3: Guest API For Native Constraints

Goal:

- expose the shared constraint model through native declarations

Needed work:

- add first-class guest APIs in `as-harness` and `node:test`-style contexts for
  constraint declaration
- keep APIs structural and scheduler-neutral
- lower those APIs into shared metadata, not adapter-local scheduling

Examples:

- native sequential scope helpers
- explicit dependency declarations
- optional suite-local planning hint setters

Files likely affected:

- `assembly/assembly/as_harness/`
- `assembly/assembly/node_test/`
- `assembly/assembly/internal/context.ts`

Status:

- complete for this dev cycle without further API growth

Decision:

- keep the shipped native surface as the contract:
  chainable declaration handles for `dependsOn(...)`, `inBand(...)`,
  `bail(...)`, and `continueOnFailure(...)`; explicit `sequential(...)`
  declarations; and `SuiteContext` / `TestContext` hint setters
- do not add a second native helper family that tries to mirror scheduler
  operations directly

Reason:

- the existing surface already lowers cleanly into shared metadata
- adding more helpers now would duplicate declaration pathways without adding
  host-owned planning power
- leaving the surface narrow keeps adapters converging on one metadata model

### Slice 4: Adapter Lowering For Framework-Shaped Constraints

Goal:

- let thin adapters express framework-shaped controls without owning
  execution

Needed work:

- map `vitest` sequential controls into shared sequential-scope metadata
- decide whether `uvu` gets guest-visible hint APIs beyond the current
  `.run()` / `exec()` no-op compatibility surface
- keep adapters thin by lowering into shared metadata only

Recommended first adapter targets:

- `vitest`: continue leaning on sequential constraints because they already fit
  the host-owned planner
- `uvu`: if anything is added, add host-readable hints rather than guest-owned
  runner control

Files likely affected:

- `assembly/assembly/vitest/index.ts`
- `assembly/assembly/uvu/index.ts`
- adapter docs in `docs/008-2026-03-19-vitest-adapter.md` and
  `docs/014-2026-03-22-uvu-adapter-interface.md`

### Slice 5: Proof And Diagnostics

Goal:

- prove that guest hints influence planning while host scheduling remains
  authoritative

Needed work:

- add shared planner tests for hint honoring and hint fallback
- add smoke proof for constrained sequential ordering that still allows
  unrelated ready work to run in parallel
- add blocked/issue diagnostics for invalid guest-declared constraints
- add CLI proof so report output stays understandable when constraints or hints
  affect execution

Files likely affected:

- `harness/shared/start.test.cjs`
- `harness/shared/smoke-suite.cjs`
- `cli/run.test.ts`

## Concrete Semantics To Decide

These decisions should be made before implementation starts:

### 1. Hint Visibility

Decide whether ignored hints are:

- silently ignored
- included in metadata only
- surfaced as informational plan issues

Recommendation:

- ignore silently at first unless debugging becomes difficult

### 2. Bail Scope

Decide whether a `bail` hint applies to:

- one suite subtree
- one top-level branch
- the whole module

Recommendation:

- start with branch-local or suite-subtree behavior, not module-global

### 3. In-Band Scope

Decide whether an in-band hint means:

- no worker parallelism inside that subtree
- no worker parallelism for the entire branch containing that subtree

Recommendation:

- keep it subtree-scoped if the planner can do so cleanly; otherwise branch
  scope is acceptable for the first pass

### 4. Constraint Failure Handling

Decide whether unsupported constraints are:

- hard plan failures
- downgraded to ignored hints

Recommendation:

- unsupported constraints should be hard plan issues
- unsupported hints may be ignored

## What This Does Not Change

- the host still owns execution start
- targeted `run(nodeIndex)` remains the execution primitive
- the guest still does not pick the next runnable node
- async scheduling is still out of scope
- adapters still should not embed their own scheduler

## Recommended Dev-Cycle Boundary

This dev cycle should try to complete:

1. shared hint/constraint metadata contract
2. host planner support for at least `bail` and `in-band` hints
3. freeze the current guest-facing native APIs for those hints and constraints
4. adapter lowering for `vitest` sequential-style constraints and any selected
   `uvu` hint surface
5. shared proof and updated docs

This dev cycle should not try to complete:

- guest-owned scheduler entrypoints
- async execution
- full upstream `uvu` callable-suite compatibility
