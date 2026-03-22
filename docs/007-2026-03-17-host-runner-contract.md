# Host Runner Contract

This defines the shipped JavaScript host-runner contract used by CLI and verified by
`harness/js`, `harness/wazero`, and `harness/wasmtime`.

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
5. execute ready runnable tests across same-machine worker slots by calling
   targeted `run(nodeIndex)` on the planned replay handles
6. aggregate the raw branch data into `HarnessStartResult`

This is the shipped module-global scheduling contract: discovery and planning
stay deterministic, while ready work fans out across same-machine worker slots
when available.

Field-level contract:

- `discoveryOk` is `true` only when top-level discovery and each required branch
  discovery succeeded
- `planningOk` is `true` only when planning produced no issues and no tests were
  blocked by invalid or unsatisfied prerequisites
- `topLevelNodes` is the ordered root discovery result
- discovered nodes preserve stable declaration metadata including `nodeId`,
  `parentNodeId`, `declarationOrder`, `sequenceMode`,
  `preferredRunnerMode`, `preferredFailurePolicy`, `only`,
  `expectFailure`, and `dependencyNodeIds`
- `discoveredTestCount` is the total count of discovered test nodes across all
  branches
- `branches[*].discovery.nodes` contains the branch root plus every
  structurally visible node discovered under it
- `branches[*].executions` contains one entry per runnable normal test node in
  discovery order
- `planIssues` contains ordered planning or blocked-dependency diagnostics,
  including the machine-readable `type`, the concise `issueLabel`, and the
  target/dependency identity fields
- `blocked` contains planner-blocked tests together with their primary issue
  code, concise `issueLabel`, and dependency identity
- `workerCount` reports the number of execution slots actually used by the
  shared executor for the run; the shipped hosts use same-machine worker slots
  for ready work when parallel capacity is available
- `coverage` is either the merged snapshot for the run or `null` when coverage
  was not requested
- `start().then(result => result.metadata)` is a required detached snapshot of
  the module-global orchestration summary and contains the same values as the
  top-level run summary fields without sharing those mutable arrays
- scheduler-step entrypoints are not part of the current shipped contract; the
  current direction keeps targeted replay as the execution primitive while the
  host-owned scheduler settles

Dependency policy:

- `dependencyNodeIds` resolve through the dependent node's parent-identity
  chain, not through a single module-global `nodeId` map
- duplicate dependency edges collapse during planning
- a prerequisite satisfies a dependent when it passes normally
- an `expectFailure` prerequisite satisfies a dependent only when it fails
  as expected
- an `expectFailure` execution that fails as expected is semantically
  successful in `execution.ok`, branch/result `ok`, and CLI reporting
- an `expectFailure` execution that passes unexpectedly is a failing
  prerequisite and can block its dependents
- a failing or trapping prerequisite blocks its dependents transitively with
  `blocked-dependency`
- a skipped, todo, filtered-out, or otherwise undiscovered prerequisite blocks
  its dependents with `missing-dependency`
- dependency cycles block each participating node with `dependency-cycle`,
  with a blank dependency identity key on the blocked diagnostic
- when multiple runnable nodes are otherwise ready at the same time, the lowest
  declaration order runs first
- declaration order is also the ready-queue tie-breaker across branches after
  dependency and sequential constraints are applied
- blocked tests are distinct from skipped tests in reporting because the user
  declared a runnable node, but the graph made execution impossible

Hint policy:

- `preferredRunnerMode` and `preferredFailurePolicy` are read from the nearest
  declaring ancestor when the host resolves one runnable target
- `preferredRunnerMode = in-band` keeps that hinted scope on the main-thread
  execution lane while unrelated ready work may still use worker fanout
- `preferredFailurePolicy = bail` blocks the remaining nearest hinted scope
  after the first unsatisfied execution inside it
- `preferredFailurePolicy = continue` opts a scope out of an inherited `bail`
- these fields remain host-owned planning hints rather than binding
  correctness constraints, so the host may still ignore unsupported future
  hint values without changing the discovery contract

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
  including the required `result.metadata` snapshot mirror proof
- shared planner-focused smoke coverage in
  [harness/shared/start-planner-smoke.cjs](../harness/shared/start-planner-smoke.cjs)
  and [harness/shared/start.test.cjs](../harness/shared/start.test.cjs),
  including declaration-order tie-breaking, duplicate-edge collapse, cycle
  detection, expected-failure prerequisite satisfaction, skip/todo/only-filtered
  missing-prerequisite coverage, in-band metadata snapshot detachment, and
  nearest-scope `bail` / `continue` hint evaluation
- CLI run coverage in
  [cli/run.test.ts](../cli/run.test.ts), including guest-declared dependency
  success, blocked, and missing-dependency reporting through the shipped
  `js`, `wazero`, and source-built `wasmtime` hosts, plus the documented
  `skip`, `todo`, `only`-filtered, expected-failure, duplicate-edge,
  blocked-propagation, dependency-cycle matrix with explicit blocked
  cycle-member diagnostics, and bundled `uvu` hint-lowering proof through
  real compile-and-run paths
- package-local host tests in `harness/js`, `harness/wazero`, and
  `harness/wasmtime`
- the CI source-host matrix and packaged verification flow described in
  [004-2026-03-17-release-process.md](./004-2026-03-17-release-process.md),
  including the Node-targeted source CLI bundle path for the Node 25
  source-host matrix and the staged packaged Bun executable path for release
  verification
