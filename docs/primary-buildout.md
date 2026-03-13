
Here is a concrete game plan split into **AssemblyScript/Wasm-side responsibilities** and **host-side responsibilities**, assuming the host must stay runtime-agnostic.

# High-level architecture

There are two cooperating modules:

## 1. Wasm test runtime module

This lives inside the AssemblyScript-compiled Wasm binary in the `./assembly` package.

Its job is to:

* define the internal testing DSL/runtime behavior
* expose internal declaration primitives backed by WebAssembly imports
* provide front-facing APIs that lower into those internal primitives
* register nodes
* replay and traverse nodes
* execute node callbacks and lifecycle callbacks
* emit normalized binary events
* expose a minimal host-call protocol

## 2. Host orchestration module

This lives outside Wasm. Every host harness exists in the `harness/*` package, where "*" defines the host kind.

Its job is to:

* instantiate modules
* drive traversal and scheduling
* consume and decode events
* maintain canonical node state
* determine failure from unreachable/trap conditions
* provide framework-agnostic reporting and aggregation

The key boundary is:

**The Wasm side emits facts of execution; the host side owns canonical interpretation and orchestration.**

---

# Updated semantic foundation

Before the module split, these are now the effective declaration semantics:

## `normal`

* traverse node
* evaluate node normally
* descendants matter according to node kind

## `skip`

* node exists
* do not traverse node
* do not traverse its children
* node is reported as skipped

## `todo`

* node exists
* traverse children
* ignore this node’s own outcome
* descendants are still structurally relevant and should still run/traverse

That means `todo` is not just “not evaluated.” It is more like:

**container-transparent for traversal, outcome-transparent for self evaluation.**

That is important because it gives `todo` a real scheduler meaning.

---

# AssemblyScript / Wasm-side responsibilities

This is the internal runtime inside the test module.

## 1. Public test API façade and internal declaration layer

This layer defines the front-facing APIs and the lower-level internal declaration primitives for:

* `test`
* `describe`
* `skip`
* `todo`
* hook registration
* assertion integration points

Responsibilities:

* expose ergonomic front-facing APIs to test authors or adapter shims
* define internal representations for `test` / `describe` / `skip` / `todo`
* have those internal representations call out through WebAssembly imports
* make the front-facing APIs thin wrappers over those internal representations
* lower all declarations into one internal node registration system
* preserve enough metadata for deterministic rediscovery

This layer should **not** own host policy.

---

## 2. Node registration and discovery runtime

This is the core structural runtime.

Responsibilities:

* register root nodes during module initialization
* maintain active parent context during traversal
* append child nodes under the correct parent
* assign deterministic ordinal positions
* compute `NodeIndex` values
* preserve node kind, name, and declaration mode
* ensure nested declarations attach to the current traversal scope

This is the layer that makes replay-based discovery possible.

---

## 3. Traversal engine

This is the logic that takes a target node path and replays toward it.

Responsibilities:

* start from roots
* replay ancestors as needed
* rediscover nodes in deterministic order
* emit `NodeFound`
* respect declaration mode semantics:

  * `skip`: stop traversal at that node
  * `todo`: continue traversal into descendants while suppressing self outcome relevance
* stop traversal when a branch becomes unreachable
* return control cleanly after branch pruning

This is probably the center of the Wasm runtime.

---

## 4. Runnable node executor

This executes `describe` and `test` callbacks.

Responsibilities:

* emit `NodeStart`
* run the node callback
* emit `NodePass` on successful completion
* allow nested declarations during execution
* distinguish execution context enough for parent-aware child discovery
* honor `todo` semantics for self-outcome suppression
* avoid deciding final failure semantics beyond surfacing unreachable to the host

For clarity: this layer emits success, but **does not own final failure classification**.

---

## 5. Hook / lifecycle executor

Hooks are not structural nodes, so they need their own execution subsystem.

Responsibilities:

* register lifecycle callbacks in relation to structural nodes/scopes
* execute them at the correct traversal points
* emit `CallbackStart`
* emit `CallbackPass`
* allow fail metadata emission inside callbacks
* let unreachable propagate to the host as callback failure

You will need very explicit ordering guarantees here, especially around:

* `beforeAll`
* `beforeEach`
* `afterEach`
* `afterAll`

---

## 6. Assertion bridge

This is the glue between assert libraries and the event model.

Responsibilities:

* expose the minimal runtime primitive assertion libraries can target
* emit `FailMessage` before intentional failure when a message exists
* support message-less failure paths
* work uniformly inside node bodies and callbacks
* normalize “assertion failure” into “emit metadata, then become unreachable”

This is one of the most important compatibility seams.

---

## 7. Event encoder / transport boundary

This is the binary protocol emitter.

Responsibilities:

* define packed binary event payload layouts
* serialize:

  * `NodeFound`
  * `NodeStart`
  * `NodePass`
  * `FailMessage`
  * `CallbackStart`
  * `CallbackPass`
* encode `NodeIndex` as flat bytes
* encode names/messages as UTF-8 bytes
* write events to the host through imported host functions or shared buffers
* keep the format stable and language-agnostic

This layer is what makes the host portable across N-API, Rust, Go, TS, and anything else.

---

## 8. Minimal host-call ABI layer

This is the imported/exported Wasm ABI surface.

Responsibilities:

* expose exports for:

  * root discovery
  * targeted traversal
  * possibly scheduler step entrypoints
* import host event sinks / host services
* keep ABI flat, simple, and portable
* avoid leaking AssemblyScript-specific object layout across the boundary

This should be treated like a tiny systems API, not like an in-process JS API.

---

## 9. Runtime-local ephemeral state management

The Wasm side will need short-lived execution state.

Responsibilities:

* active parent scope
* active node path
* current hook phase
* current traversal target
* per-traversal child discovery buffers
* temporary replay state

Important boundary:

* this state should be **ephemeral and attempt-local**
* the Wasm side should not be the canonical owner of long-term test graph truth
* the host should remain the source of truth for durable state

---

# Host-side responsibilities

This side must remain runtime-agnostic and independent of any one embedding environment.

## 1. Wasm runtime adapter layer

This is the environment-specific shell.

Responsibilities:

* instantiate the Wasm module
* provide imported functions expected by the module
* catch traps/unreachable from the Wasm engine
* expose a uniform internal interface regardless of embedding:

  * Node.js
  * N-API
  * Rust host
  * Go host
  * TS wrapper
  * CLI runner

This layer should isolate runtime-specific mechanics from the rest of the host.

Think of it as the **platform adapter**.

---

## 2. Event ingestion and decoding

This is the first real host-core subsystem.

Responsibilities:

* receive raw binary event payloads
* decode packed event structs
* decode `NodeIndex`
* decode UTF-8 strings
* route events into the canonical state machine
* remain stable across host language implementations

This should be designed as a spec-first binary decoder, not an ad hoc convenience parser.

---

## 3. Canonical node graph store

This is the durable host-side model of the test tree.

Responsibilities:

* create nodes on first `NodeFound`
* index nodes by `NodeIndex`
* store:

  * kind
  * name
  * declaration mode
  * parent/child relationships
  * discovery state
  * execution state
  * aggregate state
  * known child metadata
* preserve metadata even when later ancestor replay fails

This is the host’s main state store.

---

## 4. Determinism validator

This subsystem enforces rediscovery invariants.

Responsibilities:

* on repeated `NodeFound`, verify:

  * kind matches
  * name matches
  * declaration mode matches, once included in payload/spec
* detect structural mismatch during replay
* classify nondeterministic rediscovery as a host-level structural error
* prevent silent tree corruption

This should be separate from the generic node store, even if implemented nearby.

---

## 5. Traversal scheduler

This is the orchestration brain.

Responsibilities:

* choose which root or descendant workload to traverse next
* drive targeted traversals into Wasm
* handle root-parallel execution in the future
* prune failed branches for the current attempt
* respect declaration modes:

  * `skip`: never schedule subtree traversal
  * `todo`: schedule descendants, suppress self-outcome significance
* resume sibling work after branch failure
* support future worker/goroutine-based root isolation

This module should be pure orchestration, not event decoding.

---

## 6. Failure interpreter

Because the host defines failure, this should be explicit.

Responsibilities:

* interpret Wasm trap/unreachable as failure
* determine whether the failure belongs to:

  * current node execution
  * current callback execution
  * ancestor retraversal
* mutate node state accordingly
* block/prune descendants when ancestors fail
* preserve known descendant metadata for reporting
* attach any prior `FailMessage` payload to the right failed unit

This is a core piece of logic and deserves its own boundary.

---

## 7. Lifecycle / hook state tracker

Even though hooks are not structural nodes, the host still needs to understand them.

Responsibilities:

* track callback start/pass events
* associate hooks with their structural node context
* correlate callback failure via unreachable
* record lifecycle history for debugging and reporting
* help determine why a branch failed during traversal

This may live adjacent to the failure interpreter, but it is its own concern.

---

## 8. Result aggregation engine

This computes node states after raw events are ingested.

Responsibilities:

* compute self state for tests/describes
* compute aggregate state for dependent containers
* apply declaration mode semantics:

  * `skip`: skipped, subtree not traversed
  * `todo`: self outcome ignored, descendants still aggregated
* preserve independence of `test`
* preserve dependence of `describe`
* handle partial/incomplete traversal states

This is the policy layer that turns raw events into test results.

---

## 9. Reporting model / normalized output API

This is the host-facing data model for any consumer.

Responsibilities:

* expose normalized test graph state to:

  * CLI reporters
  * IDE integrations
  * N-API consumers
  * JSON reporters
  * snapshot/debug tooling
* remain independent of any specific host language
* provide stable semantic output even if underlying host runtime changes

This is the layer other integrations should consume, not raw events.

---

## 10. Platform-neutral core API

Since the host may exist in Rust, Go, TS, or N-API, you need a portable host-core contract.

Responsibilities:

* define environment-independent interfaces for:

  * module execution
  * event ingestion
  * scheduler control
  * graph inspection
  * reporting
* isolate platform-specific glue from core semantics
* make the core logic implementable in multiple languages if needed

In practice, this means your host should probably be designed as:

* a **spec**
* plus one or more **reference implementations**

rather than as one language’s incidental architecture.

---

# Recommended module split

Here is the cleanest practical split I would use.

## AssemblyScript / Wasm modules

### 1. `api`

Front-facing testing APIs plus internal import-backed declaration primitives that those APIs call.

### 2. `registry`

Node registration, parent-aware scope handling, child attachment.

### 3. `traversal`

Replay engine and targeted traversal logic.

### 4. `executor`

Runnable node execution for `test` and `describe`.

### 5. `hooks`

Lifecycle callback registration and execution.

### 6. `assert_bridge`

Assertion failure metadata emission and intentional crash bridge.

### 7. `events`

Binary event type definitions and encoding.

### 8. `abi`

Host imports/exports and raw Wasm boundary layer.

### 9. `state`

Ephemeral runtime-local traversal state.

---

## Host-side modules

### 1. `runtime_adapter`

Embedding-specific Wasm execution shell.

### 2. `event_decoder`

Raw binary event parsing.

### 3. `graph_store`

Canonical node graph and metadata store.

### 4. `determinism`

Replay validation and mismatch detection.

### 5. `scheduler`

Traversal workload planning and execution order.

### 6. `failure`

Trap/unreachable interpretation and failed-state mutation.

### 7. `lifecycle`

Hook/callback tracking.

### 8. `aggregation`

Self/aggregate result computation.

### 9. `reporting`

Normalized output model and reporters.

### 10. `host_api`

Portable façade consumed by N-API / Go / Rust / TS frontends.

---

# Key design rule for the host

Since you want the host agnostic to where it runs, the host core should treat the Wasm engine as just three things:

* something that can be instantiated
* something that can be invoked with traversal commands
* something that can emit binary events and possibly trap

That is the correct portability boundary.

Do **not** let Node.js, N-API, Go, or Rust assumptions leak into your semantic core.

---

# Updated declaration-mode responsibilities

Because you changed `skip` and `todo`, both sides need to honor them explicitly.

## Wasm side

### `skip`

* register node metadata
* emit `NodeFound`
* do not execute node
* do not traverse children

### `todo`

* register node metadata
* allow descendant traversal/discovery
* do not treat this node’s own outcome as semantically binding

## Host side

### `skip`

* mark node skipped
* do not schedule subtree

### `todo`

* mark node todo
* continue scheduling descendants
* suppress self-outcome contribution for that node
* still include descendant results in parent/container aggregation as appropriate

---

# Minimal responsibility summary

## Wasm side owns

* declaration lowering
* deterministic node discovery
* traversal mechanics
* callback execution
* hook execution
* event emission
* failure metadata emission
* simple ABI

## Host side owns

* binary decoding
* canonical graph storage
* determinism enforcement
* scheduling
* trap/failure interpretation
* state mutation
* aggregation
* final reporting
* portability across embeddings

---

# Suggested implementation order

To keep this manageable, I would stage it like this:

## Phase 1

Define the **wire protocol** and the exact semantic contracts:

* events
* node kinds
* declaration modes
* trap/failure meaning
* `skip` and `todo`

## Phase 2

Build the **host canonical model** first on paper:

* graph store
* scheduler rules
* aggregation rules
* ancestor failure mutation rules

## Phase 3

Build the **Wasm runtime skeleton**:

* root registration
* parent-aware discovery
* `NodeFound`
* `NodeStart`
* `NodePass`

## Phase 4

Add hooks and assertion bridge:

* `CallbackStart`
* `CallbackPass`
* `FailMessage`
* trap propagation

## Phase 5

Add retraversal failure handling and subtree pruning.

## Phase 6

Add concurrency at the root boundary only.

The next useful thing to write out is a strict module-by-module interface contract: for each module, its inputs, outputs, owned state, and what it is forbidden to decide.
