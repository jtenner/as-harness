# Host Runner Contract

This document defines the shipped JavaScript-facing host-runner contract used by
the CLI and proved across `harness/js`, `harness/wazero`, and
`harness/wasmtime`.

Use it with [003-2026-03-17-harness-abi.md](./003-2026-03-17-harness-abi.md):

- [003-2026-03-17-harness-abi.md](./003-2026-03-17-harness-abi.md) defines the guest Wasm import/export and
  event-payload wire contract
- this document defines the host object shape, method semantics, and
  orchestration contract above that wire layer

The canonical TypeScript surface is
[harness/shared/harness-types.d.ts](../harness/shared/harness-types.d.ts).

## `createHarness(bytes)`

`createHarness(bytes)` must accept:

- `Buffer`
- `Uint8Array` or another `ArrayBufferView`
- `ArrayBuffer`

Any other input must throw `TypeError`.

The returned object must satisfy the `Harness` interface from
[harness/shared/harness-types.d.ts](../harness/shared/harness-types.d.ts).

## Event Registration

Each `on*` method registers exactly one active callback slot for its event kind:

- `onNodeFound(...)`
- `onNodeStart(...)`
- `onNodePass(...)`
- `onNodeFail(...)`
- `onFailMessage(...)`
- `onCallbackStart(...)`
- `onCallbackPass(...)`
- `onCallbackFail(...)`
- `onDiagnostic(...)`
- `onLog(...)`

Registration contract:

- the argument must be a function or the host must throw `TypeError`
- registering a new callback for the same event kind replaces the previous
  callback for that slot
- the host does not fan a single event kind out to multiple listeners
- event objects must be decoded into plain JavaScript data matching
  [harness/shared/harness-types.d.ts](../harness/shared/harness-types.d.ts)

## Direct Calls

`callI32(exportName)`:

- `exportName` must be a string or the host must throw `TypeError`
- the host instantiates the guest, calls the named zero-argument export, and
  returns its `u32` value as a JavaScript number
- missing exports, traps, and invalid results must surface as an `Error`

`discover(nodeIndex)`:

- `nodeIndex` must be an array of unsigned 32-bit ordinals or the host returns
  `false`
- the host stages that `NodeIndex`, calls guest `discover()`, decodes emitted
  `nodeFound` events, and returns `true` on non-negative guest success
- `discover([])` stages an empty `NodeIndex`, so it targets the root node

`run(nodeIndex)`:

- `nodeIndex` must be an array of unsigned 32-bit ordinals or the host returns
  `false`
- the host stages that `NodeIndex`, calls guest `run()`, decodes emitted
  events, and returns `true` only when the guest returns `1`
- `run([])` stages an empty `NodeIndex`, so it targets the root node

The exact traversal and event rules behind those methods are defined in
[003-2026-03-17-harness-abi.md](./003-2026-03-17-harness-abi.md).

## `start()`

`start()` must return `Promise<HarnessStartResult>`.

The current shipped orchestration contract is:

1. discover the root node's immediate children
2. treat those nodes as top-level branches
3. rediscover each branch to collect its structurally visible nodes
4. build a module-global execution plan from the discovered runnable tests
5. execute planned runnable tests through one shared execution slot
6. aggregate the raw branch data into `HarnessStartResult`

Field-level contract:

- `discoveryOk` is `true` only when top-level discovery and each required branch
  discovery succeeded
- `planningOk` is `true` only when planning produced no issues and no tests were
  blocked by invalid or unsatisfied prerequisites
- `topLevelNodes` is the ordered root discovery result
- discovered nodes preserve stable declaration metadata including `nodeId`,
  `parentNodeId`, `declarationOrder`, `sequenceMode`, `only`,
  `expectFailure`, and `dependencyNodeIds`
- `discoveredTestCount` is the total count of discovered test nodes across all
  branches
- `branches[*].discovery.nodes` contains the branch root plus every
  structurally visible node discovered under it
- `branches[*].executions` contains one entry per runnable normal test node in
  discovery order
- `planIssues` contains ordered planning or blocked-dependency diagnostics
- `blocked` contains planner-blocked tests together with their primary issue
  and dependency identity
- `workerCount` reports the number of execution slots actually used by the
  shared executor for the run; the current shipped hosts satisfy that contract
  in-band without a dedicated worker thread
- `coverage` is either the merged snapshot for the run or `null` when coverage
  was not requested

Dependency policy:

- `dependencyNodeIds` resolve through the dependent node's parent-identity
  chain, not through a single module-global `nodeId` map
- a prerequisite satisfies a dependent when it passes normally
- an `expectFailure` prerequisite satisfies a dependent only when it fails
  as expected
- an `expectFailure` execution that fails as expected is semantically
  successful in `execution.ok`, branch/result `ok`, and CLI reporting
- an `expectFailure` execution that passes unexpectedly is a failing
  prerequisite and can block its dependents
- a failing or trapping prerequisite blocks its dependents with
  `blocked-dependency`
- a skipped, todo, filtered-out, or otherwise undiscovered prerequisite blocks
  its dependents with `missing-dependency`
- blocked tests are distinct from skipped tests in reporting because the user
  declared a runnable node, but the graph made execution impossible

Targeted discovery detail:

- successful non-root guest `discover(nodeIndex)` now emits the resolved target
  node before any immediate children under it
- `start()` branch rediscovery must ignore that replayed self-node when it is
  collecting only the branch root's immediate children
- after that filtering step, the branch root still appears exactly once in the
  final discovery snapshot as `branches[*].root` and
  `branches[*].discovery.nodes[0]`

Failure handling:

- a discovery failure below a test node prunes that sub-branch without making
  the whole branch discovery fail
- a discovery failure at a non-test branch node makes that branch discovery
  fail
- any failed execution makes that branch `ok: false`
- any failed branch makes the top-level result `ok: false`

## Coverage

Coverage methods are part of the same host-runner contract:

- `getCoverageSnapshot()` returns the current snapshot or `null`
- `resetCoverage()` clears host-held coverage state
- `start()` returns merged coverage on `HarnessStartResult.coverage`

The point and report shape is defined in
[harness/shared/covers-types.d.ts](../harness/shared/covers-types.d.ts) and the
coverage ABI notes in [003-2026-03-17-harness-abi.md](./003-2026-03-17-harness-abi.md).

## Lifetime

`close()` releases any host-owned resources for that harness instance.

Current shipped expectations:

- callers may invoke `close()` when finished with a harness
- hosts may also release resources through normal garbage collection or
  finalization paths
- after close or final release, further method calls are not part of the
  shipped contract

## Proof

The current parity proof for this contract is:

- shared smoke coverage in
  [harness/shared/smoke-suite.cjs](../harness/shared/smoke-suite.cjs)
- shared planner-focused smoke coverage in
  [harness/shared/start-planner-smoke.cjs](../harness/shared/start-planner-smoke.cjs)
- CLI run coverage in
  [cli/run.test.ts](../cli/run.test.ts), including guest-declared dependency
  success, blocked, and missing-dependency reporting through the shipped
  `js`, `wazero`, and source-built `wasmtime` hosts
- package-local host tests in `harness/js`, `harness/wazero`, and
  `harness/wasmtime`
- the CI source-host matrix and packaged verification flow described in
  [004-2026-03-17-release-process.md](./004-2026-03-17-release-process.md)
