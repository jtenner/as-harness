# Guest Runtime Contracts

This document maps the internal guest modules behind the public harness ABI. Use
it with
[003-2026-03-17-harness-abi.md](./003-2026-03-17-harness-abi.md) and
[007-2026-03-17-host-runner-contract.md](./007-2026-03-17-host-runner-contract.md):

- [003-2026-03-17-harness-abi.md](./003-2026-03-17-harness-abi.md) defines the host-visible wire contract
- [007-2026-03-17-host-runner-contract.md](./007-2026-03-17-host-runner-contract.md) defines the
  JavaScript-facing host object and runner orchestration contract
- this document defines the current guest-runtime ownership boundaries

## Current Decisions

- the guest emits execution facts; the host owns orchestration, aggregation,
  and reporting
- the current shipped ABI stays flat: `write_event(...)`,
  `invoke_staged()`, `allocateNodeIndexBuffer(...)`, `discover()`, `run()`,
  `invoke()`, and `__start`
- scheduler-step entrypoints remain deferred while host-owned scheduling still
  executes through targeted `run()` replay on staged `NodeIndex` paths
- the guest may declare scheduling metadata through discovery facts, but the
  host still owns final planning and execution decisions
- the shipped native declaration API boundary for this cycle is explicit:
  chainable declaration handles for dependencies and hints, `sequential(...)`
  declarations, and `SuiteContext` / `TestContext` hint setters; no broader
  scheduler-shaped native helper family is planned this cycle
- the binding shared constraint vocabulary for this cycle is still only
  `sequenceMode` plus `dependencyNodeIds`; no additional binding field is
  planned until a concrete framework control cannot lower onto those two
- unsupported hint values still surface through discovery metadata, but the
  current host only treats them as informational `ignored-hint` planner issues
  instead of binding execution policy
- the shipped harness-backed CLI compile path now uses a conservative source
  rewrite for bare `abort(...)` and `trace(...)` calls so those sites import
  bundled internal debug helpers without mutating the compiler-owned AST
- explicit user `abort=...` and `trace=...` aliases stay authoritative over
  that wrapper-owned default path
- adding scheduler-step entrypoints later would require an ABI update, host
  parity proof, and a backlog update across the docs

## Module Map

- `api`: [assembly/assembly/internal/api.ts](../assembly/assembly/internal/api.ts)
- `registry`: [assembly/assembly/internal/node.ts](../assembly/assembly/internal/node.ts)
- `traversal`: [assembly/assembly/internal/traversal.ts](../assembly/assembly/internal/traversal.ts)
- `executor`: [assembly/assembly/internal/executor.ts](../assembly/assembly/internal/executor.ts)
- `hooks`: [assembly/assembly/internal/hooks.ts](../assembly/assembly/internal/hooks.ts)
- `assert_bridge`: [assembly/assembly/internal/assert-bridge.ts](../assembly/assembly/internal/assert-bridge.ts)
- `artifact_frame`: [assembly/assembly/internal/artifact-frame.ts](../assembly/assembly/internal/artifact-frame.ts)
- `debug`: [assembly/assembly/internal/debug.ts](../assembly/assembly/internal/debug.ts)
- `events`: [assembly/assembly/internal/events.ts](../assembly/assembly/internal/events.ts)
- `abi`: [assembly/assembly/internal/imports.ts](../assembly/assembly/internal/imports.ts), [assembly/assembly/exports.ts](../assembly/assembly/exports.ts), and [assembly/assembly/internal/trampoline.ts](../assembly/assembly/internal/trampoline.ts)
- `state`: [assembly/assembly/internal/execution-state.ts](../assembly/assembly/internal/execution-state.ts), [assembly/assembly/internal/failure-state.ts](../assembly/assembly/internal/failure-state.ts), and [assembly/assembly/internal/context.ts](../assembly/assembly/internal/context.ts)

## `api`

Purpose:

- expose declaration-time helpers used by adapters such as `node:test` and
  `jest`

Inputs:

- adapter-level declaration requests
- optional declaration metadata such as `mode`, `only`, `plan`,
  `sequenceMode`, `preferredRunnerMode`, `preferredFailurePolicy`, and hook
  kind

Outputs:

- newly registered `Node` instances
- normalized execution-option values
- hook registrations attached to the active node

Owned state:

- no durable tree state of its own
- normalization rules for declaration-time options and default names
- the guest-side vocabulary for declaration metadata that later surfaces in
  discovery events

Forbidden decisions:

- no traversal or replay decisions
- no execution scheduling
- no direct host I/O or event serialization

## `registry`

Purpose:

- own the in-memory structural test tree and deterministic `NodeIndex`
  derivation

Inputs:

- declaration-time child creation
- declaration-mode changes such as `skip` and `todo`
- hook registrations
- callback replay requests

Outputs:

- structural `Node` objects with parent/child relationships
- deterministic `NodeIndex` values
- lazily resolved or replay-resolved child lists

Owned state:

- root node and current declaration cursor
- per-node declaration metadata
- child ordering and ordinals
- registered hooks and replay-reset behavior
- binding constraints such as `sequenceMode` and `dependencyNodeIds`
- host-readable hints such as `preferredRunnerMode` and
  `preferredFailurePolicy`

Forbidden decisions:

- no host reporting aggregation
- no wire-format encoding
- no durable attempt-local failure state
- no host-owned scheduling policy
- no host-facing decision about whether a declared hint is honored or ignored
  beyond preserving unsupported values so the host can surface
  informational `ignored-hint` planner issues

## `traversal`

Purpose:

- resolve requested `NodeIndex` paths and drive structural discovery

Inputs:

- parent node or root node
- staged `NodeIndex`
- declaration-mode and `only` filtering metadata from the registry
- discovered constraint and hint metadata attached to each node

Outputs:

- resolved `Node | null`
- immediate-child discovery counts
- `nodeFound(...)` emissions for structurally visible nodes reached by the
  current discovery call
- delegated run requests into the executor

Owned state:

- no durable state
- visibility and pruning rules for traversal-time decisions

Forbidden decisions:

- no callback execution ordering beyond delegating to the executor
- no report-tree aggregation
- no host-facing byte decoding
- no host-owned decision about whether a hint changes execution policy
  beyond preserving unsupported values so the host can report
  `ignored-hint` metadata

Current contract details:

- `NodeIndex` is resolved relative to the supplied parent, not as a global
  opaque id
- an empty `NodeIndex` resolves to the supplied parent itself
- successful targeted discovery for a non-root node emits that resolved target
  node before returning, in addition to any structurally visible immediate
  children reached under it
- child ordinals are interpreted after local `only` filtering
- skipped nodes stay structurally visible, but their descendants are pruned
- todo nodes stay structurally visible, their descendants stay addressable, and
  only the todo node's own self-outcome significance is suppressed by direct
  execution
- repeated lookup and discovery calls may replay ancestor callbacks in order to
  rebuild child state deterministically

## `executor`

Purpose:

- execute one resolved node with lifecycle hooks and trap observation

Inputs:

- resolved target `Node`
- hook registrations from the registry
- assertion/failure state helpers
- trampoline trap boundary

Outputs:

- boolean execution result
- `nodeStart`, `callbackStart`, `callbackPass`, `callbackFail`, `nodeFail`,
  and `nodePass` event emissions
- updates to attempt-local assertion/failure state

Owned state:

- staged hook invocation slot
- staged node invocation slot
- node-chain ordering used for hook execution

Forbidden decisions:

- no `NodeIndex` lookup policy
- no cross-branch scheduling
- no host-owned result aggregation

## `hooks`

Purpose:

- define the typed shape of one lifecycle-hook registration

Inputs:

- hook kind
- callback
- timeout metadata

Outputs:

- `HookRegistration` records

Owned state:

- none beyond the contents of each `HookRegistration`

Forbidden decisions:

- no execution
- no failure classification
- no scheduling or traversal policy

## `assert_bridge`

Purpose:

- translate guest assertion helpers into failure-state updates plus emitted
  assertion facts

Inputs:

- assertion operands
- optional failure messages
- strict-equality helpers
- trampoline-backed trap observation for throw-style assertions

Outputs:

- assertion success or trap-driven failure
- `failMessage(...)` emissions when appropriate
- failure-kind and active-error updates

Owned state:

- no durable runtime state of its own
- assertion semantics and comparison helpers

Forbidden decisions:

- no node lookup
- no lifecycle ordering
- no host reporting text beyond the emitted low-level fail message fact

## `artifact_frame`

Purpose:

- own the active harness-visible crumb stack and source markers used by
  snapshots, diagnostics, and structured debug payloads

Inputs:

- declaration-time source markers injected by the compile path
- executor-driven frame push and pop around suite, hook, and test callbacks

Outputs:

- live top-frame reads for existing diagnostics
- cloned frame snapshots for structured debug payload emission

Owned state:

- the active artifact-frame stack
- current frame source markers and `NodeIndex` copies

Forbidden decisions:

- no wire encoding
- no host-owned reporting policy
- no claim that artifact frames are a full general-purpose guest stack trace

## `debug`

Purpose:

- provide the bundled internal `harnessAbort(...)` and `harnessTrace(...)`
  helpers used by the wrapper-owned source rewrite path

Inputs:

- rewritten guest calls to bare `abort(...)` and `trace(...)`
- direct compiler-provided abort file, line, and column metadata when present
- current artifact-frame snapshots and raw host abort import access

Outputs:

- structured `Debug` event emissions through `events`
- delegation to the raw host abort import for trap preservation

Owned state:

- no durable state of its own
- the runtime policy for translating rewritten abort/trace calls into the
  structured debug contract

Forbidden decisions:

- no host-side stack formatting policy
- no claim of complete function-by-function guest stack reconstruction
- no compiler-owned AST mutation; the helper only runs after the wrapper has
  already rewritten source text

## `events`

Purpose:

- serialize typed guest facts into the flat host-visible wire payloads

Inputs:

- typed event data such as `NodeIndex`, hook kind, failure kind, message text,
  coverage point metadata, debug crumb snapshots, debug locations, constraint
  metadata, and scheduling-hint metadata

Outputs:

- packed `StaticArray<u8>` payloads
- calls into `write_event(...)`

Owned state:

- no durable state
- the authoritative guest-side payload layout and encoding helpers
- the authoritative byte layout for `sequenceMode`, `dependencyNodeIds`,
  `preferredRunnerMode`, and `preferredFailurePolicy` on `NodeFound`
- the authoritative byte layout for structured `Debug` events

Forbidden decisions:

- no host payload decoding
- no traversal or execution policy
- no aggregation of results across attempts

## `abi`

Purpose:

- expose the flat import/export boundary shared by every host

Inputs:

- imported host callbacks: `write_event(...)` and `invoke_staged()`
- raw AssemblyScript environmental imports such as `abort(...)` and `trace(...)`
- staged node-index memory written by the host
- staged trampoline callbacks from guest execution helpers

Outputs:

- exported guest entrypoints: `allocateNodeIndexBuffer(...)`, `discover()`,
  `run()`, and `invoke()`
- optional `__start`

Owned state:

- staged node-index scratch buffer in `exports.ts`
- staged trap-callback stack in `trampoline.ts`
- enum discriminants and import declarations in `imports.ts`

Forbidden decisions:

- no host scheduling or reporting policy
- no extra scheduler-step exports in the current ABI
- no per-host specialization in the guest ABI surface
- no source-rewrite policy; that stays in the CLI wrapper, outside the guest
  runtime ABI

## `state`

Purpose:

- own attempt-local execution and failure facts that other guest modules read

Inputs:

- assertion-scope lifecycle notifications
- assertion-call counts
- failure-kind and active-error updates
- run-only toggles

Outputs:

- read access for `context`, `executor`, and assertion helpers
- derived values such as `attempt`, `passed`, and active error pointer

Owned state:

- current assertion scope activity
- planned and observed assertion counts
- active node name
- active attempt metadata
- active node passed flag
- active run-only flag
- active error message and failure kind

Forbidden decisions:

- no durable structural tree ownership
- no host-facing scheduling or reporting decisions
- no hidden state that should survive the end of one execution attempt

## Cross-Module Rules

- only `events` may define guest-to-host payload encoding
- only `abi` may define the flat imported/exported boundary
- only `registry` owns durable node structure
- only `state` owns attempt-local assertion and failure facts
- only `executor` owns lifecycle execution ordering
- only the CLI compile wrapper may rewrite source text for the shipped debug
  override path; guest runtime modules must not attempt compiler-owned AST
  mutation
- the host remains the durable source of truth for branch scheduling, result
  aggregation, and user-facing reporting
- guest-declared hints may flow through discovery metadata, but only the host
  may decide whether those hints influence planning
