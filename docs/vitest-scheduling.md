# Vitest Scheduling and Test Graph Strategy

This document plans the next honest scheduling step for the thin `"vitest"`
guest adapter and the shared harness work that a future native `"as-harness"`
adapter will need.

The short version is:

- upstream Vitest schedules mostly with file-level parallelism plus in-file
  order controls
- the current `as-harness` runtime is still tree-shaped and path-addressed
- stable test identifiers are the first real blocker for dependency-aware
  scheduling
- graph semantics should live in the shared host scheduler, not inside thin
  framework adapters

## Research Basis

Official Vitest references checked on 2026-03-19:

- [Parallelism guide](https://vitest.dev/guide/parallelism.html)
- [Test API](https://main.vitest.dev/api/test)
- [Describe API](https://main.vitest.dev/api/describe)
- [Config reference](https://main.vitest.dev/config/)

Local contract references:

- [docs/Vitest.md](./Vitest.md)
- [docs/harness-abi.md](./harness-abi.md)
- [docs/host-runner-contract.md](./host-runner-contract.md)
- [assembly/assembly/internal/node.ts](../assembly/assembly/internal/node.ts)
- [assembly/assembly/internal/traversal.ts](../assembly/assembly/internal/traversal.ts)
- [harness/shared/start.cjs](../harness/shared/start.cjs)

## What Vitest Actually Schedules

Vitest does not expose a public dependency graph model like
`dependsOn(otherTest)`.

Its scheduling model is mostly:

- file-level parallelism across workers
- sequential execution inside a file by default
- opt-in in-file concurrency through `test.concurrent` and
  `describe.concurrent`
- ordered overrides through `test.sequential` and `describe.sequential`
- optional randomization through `sequence.shuffle`

Important implications:

- `test.sequential` is an ordering override, not a dependency edge
- `test.fails` is expected-failure metadata, not a scheduler primitive
- Vitest's concurrency model is promise-driven and worker-aware, which does not
  map directly onto the current synchronous Wasm runtime

So the existing thin `as-harness` `"vitest"` adapter can honestly expose
low-risk synchronous declaration aliases, but broader scheduler parity requires
shared runtime work rather than adapter-local tricks.

## Current `as-harness` Scheduling Model

Today the shared harness works like this:

1. the guest declares a tree of nodes
2. nodes are targeted by structural `NodeIndex` paths
3. discovery redisplays a branch by replaying callbacks
4. `start()` rediscovers each top-level branch
5. runnable normal tests in that branch are executed independently
6. the host may execute different top-level branches in parallel worker slots

Relevant current facts:

- the guest runtime is tree-shaped, not graph-shaped
- `NodeIndex` is the only host-visible execution handle today
- replay rediscovery creates ephemeral child nodes under replay buffers
- `only` filtering changes which sibling ordinals are addressable
- `start()` currently partitions execution by top-level branch in
  [harness/shared/start.cjs](../harness/shared/start.cjs)

That model is fine for plain tree traversal. It is not enough for dependency
edges.

## Why `NodeIndex` Is Not Enough

`NodeIndex` is a traversal address. It is not a stable graph identity.

Problems:

- it is relative to visible child order, so `only` filtering can change what a
  path means
- the replay path creates new child `Node` objects, so naive
  "assign an ID when a `Node` is constructed" logic will drift
- branch-local execution assumes tests are independent, but dependency edges can
  cross branch boundaries
- a future native adapter needs declaration handles or refs that survive
  rediscovery and reporting, not just a transient path

So `v0.3.0` should treat stable identity as a prerequisite rather than an
optional cleanup.

## Design Goals

- keep thin framework adapters thin
- preserve the current structural tree for nesting and hook ownership
- add graph metadata without hiding it inside adapter-specific code
- keep the first graph-aware scheduler synchronous and deterministic
- preserve declaration order as the default tie-breaker
- make invalid graphs diagnosable instead of silently ignored

## Non-Goals for `v0.3.0`

- promise-based async scheduling
- real `test.concurrent` parity
- shuffle support
- retries, repeats, or per-test timeout enforcement
- cross-module dependency graphs
- adapter-local schedulers that bypass the shared host planner

## Proposed Shared Model

The shared runtime should keep two related structures:

- a structural tree for suites, hooks, visibility, and targeted replay
- an execution graph for ordering and dependency constraints

Each declared node should eventually have metadata equivalent to:

```ts
type ScheduledNode = {
  nodeId: number;
  parentId: number | null;
  nodeIndex: number[];
  declarationOrder: number;
  kind: "test" | "suite";
  declarationMode: "normal" | "skip" | "todo";
  only: boolean;
  expectFailure: boolean;
  sequenceMode: "inherit" | "sequential";
  dependsOnIds: number[];
};
```

This is a planning shape, not a final wire format.

The important part is the separation:

- `nodeIndex` remains a traversal address
- `nodeId` becomes the stable identity
- ordering metadata is declared once and scheduled by the host

## Stable Identifier Strategy

The identifier contract should be:

- unique within one compiled module instance
- deterministic for deterministic declaration replay
- unaffected by `only` filtering
- stable across repeated discovery and run replay
- visible to the host without requiring path reconstruction

The current runtime makes this tricky because replay rediscovery creates fresh
child nodes. That means a plain monotonic counter on `new Node(...)` is not
enough by itself.

The safest direction is:

1. give each parent a durable declaration-slot concept
2. assign child identity from that stable slot, not from transient replay
   allocation
3. detect and diagnose replay-shape drift when a replayed callback emits a
   different declaration layout than the durable shape

Two acceptable implementation directions:

- reuse durable nodes during replay and keep scratch state separate from
  identity
- keep replay nodes ephemeral, but bind them back to durable declaration slots
  before any ID-bearing metadata is emitted

The first option is simpler semantically. The second is less intrusive if the
current replay machinery should stay mostly intact.

## Sequential Groups Versus Dependency Edges

These are related but different features.

Sequential groups:

- preserve declaration order among a chosen set of tests or suites
- do not imply "this test must pass before the next test may run"
- are a good fit for a native API like `test.sequential("group", [...])`

Dependency edges:

- explicitly require prerequisite completion before a dependent may run
- should model success/failure semantics directly
- fit APIs like `test("b", fn).dependsOn(a)`

Recommendation:

- store sequential intent as scheduling metadata, not as reporter-only sugar
- expand that metadata into execution constraints in the host planner
- keep dependency edges explicit instead of pretending sequential order alone
  captures the same meaning

## Proposed Scheduling Semantics

The first graph-aware scheduler should remain globally sequential and
deterministic.

Planning order:

1. discover the full declared structure and metadata
2. apply structural visibility rules such as `only`
3. identify runnable normal test nodes
4. expand sequential-group metadata into ordering constraints
5. add explicit dependency edges
6. validate the graph
7. topologically schedule ready nodes using declaration order as the tie-breaker
8. execute nodes one at a time

This keeps the first implementation honest while leaving room for later worker
and concurrency work.

### Recommended Rule Set

Base ordering:

- declaration order is the default stable order
- when multiple nodes are ready at once, the lowest declaration order wins

Sequential groups:

- a sequential group preserves declaration order among its runnable members
- the planner can lower this into predecessor edges between adjacent runnable
  members after filtering
- groups should apply within the declared group scope, not across unrelated
  siblings automatically

Explicit dependencies:

- a dependent is not runnable until all prerequisites are resolved
- a dependency edge should target stable node IDs, not `NodeIndex`
- duplicate edges should collapse during planning

Dependency outcomes:

- prerequisite pass: dependent may proceed
- prerequisite expected-failure that fails as expected: dependent may proceed
- prerequisite fail or trap: dependent becomes blocked
- prerequisite blocked: dependent becomes blocked transitively
- prerequisite skip or todo: dependent becomes blocked unless a future policy
  explicitly allows soft prerequisites
- missing dependency target: plan error plus blocked dependent
- dependency cycle: plan error plus blocked cycle members

Expected-failure detail:

- if a `fails` test unexpectedly passes, it should count as an unsatisfied
  prerequisite
- if a `fails` test fails as expected, it should count as a satisfied
  prerequisite

### `only`, `skip`, and `todo`

Filtering should happen before scheduling, but with diagnostics.

Recommended rules:

- `only` determines the included runnable set before graph execution begins
- if an included node depends on a node excluded by `only`, emit a diagnostic
  and block the included dependent
- `skip` and `todo` nodes are structurally visible but not runnable as normal
  prerequisites, so dependents should become blocked
- blocked should be distinct from skipped in reporting because the user asked
  for a runnable node, but the graph made it impossible

## Why Host-Owned Scheduling Is The Right Place

The guest should declare metadata. The host should schedule it.

Reasons:

- the host already owns `start()` orchestration
- reporters and external hosts need consistent blocked/error semantics
- thin adapters should not each reimplement ordering policy
- cross-branch dependencies cannot be solved inside one guest callback in the
  current architecture

This also means a graph-aware `v0.3.0` probably cannot keep the exact current
top-level branch worker model unchanged.

## Impact on `start()`

The current `start()` contract assumes:

- top-level branches are independent
- each branch can be rediscovered separately
- runnable tests can be executed as branch-local lists

That assumption breaks when dependencies can cross branches.

There are two realistic options:

1. restrict dependencies to stay within a top-level branch
2. move to a module-global scheduler

Recommendation:

- do not bake in a same-branch restriction unless the project wants a very
  limited native API
- prefer a module-global scheduler even if `v0.3.0` keeps execution fully
  sequential

That lets sequential groups and explicit dependencies share the same planner
instead of fighting the current worker partitioning.

## Suggested Contract Changes

Guest/runtime side:

- add stable node identity
- add declaration-order metadata
- add sequence/dependency metadata capture helpers
- keep adapters responsible only for declaration-time metadata mapping

ABI/event side:

- extend `NodeFound` or add a new metadata event so hosts can decode stable IDs
- decide whether dependency metadata is emitted during discovery or returned
  through a new planning path
- keep `NodeIndex` in the ABI until targeted traversal is intentionally
  replaced

Host side:

- extend `HarnessNode` with stable identity and scheduling metadata
- add a planner that validates and orders runnable tests globally
- add blocked/invalid-graph reporting semantics

CLI/reporting side:

- show blocked tests distinctly from skipped tests
- surface cycle and missing-dependency diagnostics clearly
- keep declaration order visible in JSON/debug output while the graph work is
  still settling

## Native `as-harness` API Direction

The native adapter should not be finalized before the shared model exists, but
the likely direction is:

```ts
import { test } from "as-harness";

const first = test("first test", () => {});

test("second test", () => {}).dependsOn(first);

test.sequential("group", [
  test("one", () => {}),
  test("two", () => {}),
]);
```

This API is reasonable only if declaration handles map onto stable IDs.

That is why the identifier problem should come before the public dependency API.

## Test Strategy

This feature needs more than smoke tests.

### Guest/Internal Tests

- prove stable IDs remain unchanged across repeated discovery replay
- prove declaration order metadata is deterministic
- prove replay-shape drift is diagnosed
- prove sequence and dependency metadata survive targeted rediscovery

### Pure Host Scheduler Tests

- topological sorting with declaration-order tie-breaking
- sequential-group lowering into ordering constraints
- duplicate-edge collapse
- cycle detection
- missing dependency detection
- blocked propagation
- `fails` prerequisite satisfaction rules
- `only`, `skip`, and `todo` interaction rules

These tests should be mostly pure data tests so scheduler bugs can be debugged
without recompiling Wasm fixtures for every case.

### Host Integration Tests

- `js`, `wazero`, and `wasmtime` all decode stable IDs and metadata correctly
- repeated `start()` calls do not duplicate graph metadata
- targeted discovery and targeted run still work while the graph planner is
  present

### CLI Smoke Tests

- sequential-group execution order
- explicit dependency success path
- blocked dependent after failed prerequisite
- diagnostics for missing prerequisites
- cycle-report smoke

## Recommended Implementation Order

1. make stable node identity real
2. capture declaration order and sequence metadata
3. write a pure host-side graph planner with exhaustive tests
4. extend host types and event decoding
5. switch `start()` to global graph planning
6. add blocked reporting semantics
7. add the first native `"as-harness"` ordering API
8. add explicit dependency APIs only after stable IDs are fully proved

## Practical Conclusion

For `v0.3.0`, the right blocker stack is:

- stable IDs first
- host-owned planning second
- sequential groups before arbitrary dependency APIs
- blocked semantics and diagnostics before any concurrency claims

Without that order, the project risks shipping attractive adapter syntax on top
of unstable replay identity and branch-local scheduling assumptions that will
have to be broken immediately afterward.
