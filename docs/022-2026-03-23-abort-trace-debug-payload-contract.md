# Abort And Trace Debug Payload Contract

This note answers how `as-harness` should override AssemblyScript `abort(...)`
and `trace(...)` for richer debugging, what the guest and host can honestly
report today, and which exact slices should land across `assembly/`, `cli/`,
and `harness/`. The recommendation in this note is to ship default bundled
`--use abort=harnessAbort` and `--use trace=harnessTrace` overrides for
harness-backed builds, emit a dedicated structured `Debug` event carrying guest
artifact-frame crumbs and source locations, and treat host engine stack traces
as best-effort enrichment instead of pretending that the guest can recover a
portable function-by-function stack trace after a Wasm trap.

## Research Basis

Checked on 2026-03-23 against:

- current repo runtime, ABI, reporter, compiler-wrapper, and host code
- [docs/003-2026-03-17-harness-abi.md](./003-2026-03-17-harness-abi.md)
- [docs/006-2026-03-17-guest-runtime-contracts.md](./006-2026-03-17-guest-runtime-contracts.md)
- [docs/007-2026-03-17-host-runner-contract.md](./007-2026-03-17-host-runner-contract.md)
- local `assemblyscript@0.28.10` CLI help and standard-library declarations
- official AssemblyScript stdlib docs at `https://www.assemblyscript.org/stdlib/globals.html`

The relevant upstream AssemblyScript facts are:

- `trace(...)` is a built-in environmental function with the current signature
  `trace(msg: string, n?: i32, a0?: f64, a1?: f64, a2?: f64, a3?: f64, a4?: f64): void`
- `abort(...)` is a built-in environmental function with the current signature
  `abort(msg?: string | null, fileName?: string | null, lineNumber?: i32, columnNumber?: i32): never`
- `asc --use` aliases one global under another name and can also introduce
  integer constants
- `--debug` enables debug information in the emitted binary, but AssemblyScript
  still does not expose a portable guest-owned stack object that adapters or
  hosts can reconstruct into exact source stacks after a trap

Those facts matter because they define both the opportunity and the limit:

- `as-harness` can override the default global `abort` and `trace` bindings
  with bundled helpers
- the guest can always emit structured metadata before trapping
- the guest cannot honestly promise a complete source-accurate call stack for
  every function in every host, because that information does not survive the
  current Wasm trap boundary in a portable way

## Question

How should `as-harness` override `abort(...)` and `trace(...)` so failed and
diagnostic executions carry richer payloads for debugging, while remaining
honest about what the current AssemblyScript, Wasm, and host runtime stack can
and cannot preserve?

## Short Recommendation

Ship three layers together:

1. a new guest-to-host `Debug` event that carries structured debug payloads
2. bundled `harnessAbort(...)` and `harnessTrace(...)` helpers selected through
   default `--use` aliases for harness-backed builds
3. host-side decoding and reporting that exposes guest-authored crumb stacks on
   every debug event and includes engine stack text only where the current host
   can capture it reliably

The portable debugging contract should be:

- exact debug message
- debug source kind: `trace` or `abort`
- numeric trace arguments when present
- a best-effort location
- a guest-authored crumb stack derived from the active artifact-frame stack

The best-effort host-enrichment contract should be:

- optional engine stack lines
- optional richer thrown host error text for direct `callI32(...)` or host
  failures

The contract should explicitly not claim:

- complete arbitrary function-call stacks inside guest code
- source-accurate trace callsites for every `trace(...)` call when the guest
  did not preserve them
- identical engine stack text across JS, Go, and Rust hosts

## Current Repo Behavior

Today the repo behaves like this:

- the guest imports `env.abort(...)` and `env.trace(...)` directly
- the compiler wrapper forwards user `--use` values, but does not install a
  default `abort=` or `trace=` override
- the guest event ABI includes a `Log` event for plain `trace(...)` output but
  no structured debug event for aborts or breadcrumb stacks
- the guest runtime already tracks an active artifact-frame stack, but only
  exposes the top frame to hosts and only uses it today for snapshots and test
  diagnostics
- the JS host turns `env.abort(...)` into a plain `Error("abort: ...")`
- the JS, wazero, and wasmtime hosts all turn `env.trace(...)` into the flat
  current `log` payload shape
- the reporter prints `trace: message (values...)` but has no structured abort
  or crumb formatting

That means the repo already has the right building blocks:

- a flat event sink
- a stable artifact-frame model
- harness-owned compile-time control through the CLI wrapper

What it does not have yet is a dedicated debugging contract connecting those
pieces.

## Constraints And Truths

### 1. The guest can report harness-owned crumbs, not arbitrary call stacks

The current artifact-frame stack tracks:

- the active suite / test / hook nesting
- the active node kind and hook kind
- the current harness-visible name
- the best currently recorded source file / line / column
- the active `NodeIndex`

This is exactly the right portability layer for harness debugging. It is not a
full general-purpose stack trace. It is a harness-owned execution breadcrumb
stack.

That distinction matters. The docs and shipped types should call these values
`crumbs`, `frames`, or `artifact frames`, not claim they are a complete guest
stack trace.

### 2. `abort(...)` is better than `trace(...)` for exact source locations

`abort(...)` receives `fileName`, `line`, and `column` directly from the
compiler-generated call site. That means the guest can report a specific abort
location honestly.

`trace(...)` does not receive location metadata. The best current source for
trace location is therefore:

- the current artifact-frame source when present
- otherwise no location

The guest should not invent a fake trace callsite beyond that.

### 3. Engine stacks are host-specific

The host can often capture some stack text:

- the JS host can capture a JavaScript `Error.stack`
- the wazero host can capture a Go-side stack with `debug.Stack()`
- the wasmtime host can capture a Rust backtrace or error stack

But these stacks are:

- host-runtime-specific
- not guaranteed to include clean guest source locations
- not stable enough to standardize as a required exact payload

So engine stacks should be optional host enrichment, not part of the portable
guest-authored ABI guarantee.

### 4. The compiler-wrapper override must stay user-overridable

The repo already forwards user `--use` values. The new default override must:

- apply only when the bundled harness library path is active
- append defaults only when the user has not already supplied `abort=...`
  or `trace=...`
- remain a wrapper default, not a hardcoded requirement on all direct `asc`
  compilation paths

That keeps the feature pragmatic without hijacking advanced users' existing
custom overrides.

## Recommended Wire Contract

Add a new `EventKind.Debug = 11`.

Do not overload the existing `Log` payload. The old `Log` event should remain
the current plain trace contract so direct `asc` builds that do not use the
override still decode cleanly.

The new `Debug` payload should be versionless for now and encode one record:

```text
[source_kind: u8]
[1 byte reserved]
[2 bytes reserved]
[value_count: u32]
[values: f64 * value_count]
[crumb_count: u32]
repeat crumb_count:
  [frame_kind: u8]
  [node_kind: u8]
  [hook_kind: u8]
  [1 byte reserved]
  [node_index_length: u32]
  [node_index: u32 * node_index_length]
  [name_byte_length: u32]
  [name: utf8]
  [source_file_byte_length: u32]
  [source_file: utf8]
  [source_line: u32]
  [source_column: u32]
[message_byte_length: u32]
[message: utf8]
[location_file_byte_length: u32]
[location_file: utf8]
[location_line: u32]
[location_column: u32]
```

`source_kind` values:

- `1`: trace
- `2`: abort

This contract intentionally stores both:

- a `location_*` tuple for the direct debug origin
- a full crumb stack for harness context

That separation matters because an abort location is often more specific than
the current artifact frame, while a trace location may be less specific than
the surrounding frame stack.

## Recommended Host-Facing Type Contract

Add a dedicated host event instead of overloading `HarnessLogEvent`.

Recommended shape:

```ts
export interface HarnessDebugCrumb {
  kind: number;
  nodeKind: number;
  hookKind: number;
  name: string;
  sourceFile: string;
  sourceLine: number;
  sourceColumn: number;
  nodeIndex: Array<number>;
}

export interface HarnessDebugLocation {
  fileName: string;
  line: number;
  column: number;
}

export interface HarnessDebugEvent {
  source: "trace" | "abort";
  message: string;
  values: Array<number>;
  location: HarnessDebugLocation | null;
  crumbs: Array<HarnessDebugCrumb>;
  engineStack: Array<string>;
}
```

And add:

- `debug: HarnessDebugEvent` to `HarnessEventMap`
- `onDebug(callback)` to the host contract

Reasoning:

- `log` is already the legacy flat trace channel
- a dedicated `debug` channel can carry structured breadcrumbs without
  confusing existing direct `env.trace(...)` semantics
- the CLI reporter can render both `log` and `debug` details without breaking
  old direct-build traces

## Guest Runtime Responsibilities

### Bundled override helpers

Add bundled globals:

- `harnessAbort(...)`
- `harnessTrace(...)`

These should be exported from a top-level file under `assembly/assembly/lib/`
so the bundled `--lib` root makes them visible as globals to `asc --use`.

Recommended names:

- `--use abort=harnessAbort`
- `--use trace=harnessTrace`

### `harnessAbort(...)`

Responsibilities:

- build a structured `Debug` event with `source = abort`
- use the incoming `fileName`, `line`, and `column` as the direct location
- snapshot the active artifact-frame stack into the crumb list
- emit the debug event through `write_event(...)`
- delegate to the raw host `env.abort(...)` import so the host still gets its
  normal trap / throw boundary
- if the host unexpectedly returns, `unreachable()`

Important detail:

- the helper should not claim to recover more than the compiler-provided abort
  location and the harness artifact-frame crumbs

### `harnessTrace(...)`

Responsibilities:

- build a structured `Debug` event with `source = trace`
- preserve the numeric trace values exactly as supplied
- use the active artifact-frame source as the best available location
- snapshot the active artifact-frame stack into the crumb list
- emit the debug event through `write_event(...)`
- not call raw `env.trace(...)` by default, to avoid duplicate flat `log`
  events from the host

Important detail:

- trace locations are explicitly best-effort, because AssemblyScript does not
  pass source metadata to `trace(...)`

### Artifact-frame snapshot helpers

The current artifact-frame module already tracks the stack internally. The new
runtime work should add a snapshot helper that returns cloned crumb records in
stack order.

That helper must:

- preserve the full active frame stack, not only the top frame
- clone `NodeIndex` values instead of leaking shared references
- preserve empty source locations honestly

## Host Responsibilities

### Shared host contract

All shipped hosts should:

- decode `EventKind.Debug`
- expose `onDebug(...)`
- include `debug` events in execution snapshots
- leave the existing `log` path intact for legacy direct `env.trace(...)`
  builds

### JS host

The JS host can do the richest best-effort enrichment:

- when it sees a pending abort debug event, it can delay dispatch until
  `env.abort(...)` is reached
- it can construct the JS `Error` first
- it can split `error.stack` into `engineStack` lines
- it can dispatch the fully enriched debug event before throwing

That keeps the runner event model and the thrown host error aligned.

### wazero host

The wazero host should at minimum:

- decode and surface the guest-authored debug event
- preserve empty `engineStack` when no stable enriched stack is wired yet

Optional best-effort follow-up:

- capture `debug.Stack()` in the Go abort import
- thread it into the decoded debug event if that can be done without
  destabilizing the native event bridge

### wasmtime host

The wasmtime host should at minimum:

- decode and surface the guest-authored debug event
- preserve empty `engineStack` when no stable enriched stack is wired yet

Optional best-effort follow-up:

- capture a Rust backtrace or error stack in the abort import
- thread it into the decoded debug event when the native bridge can preserve it
  cleanly

## Reporter Contract

The CLI reporter should treat `debug` events as execution details.

Recommended formatting:

- trace line:
  - `trace: failing trace (12, 13) at file.ts:10:3`
- abort line:
  - `abort: message at file.ts:10:3`
- crumb lines:
  - `crumb: test "name" at file.ts:8:1 [1,0]`
  - `crumb: hook "suite name" at file.ts:4:1 []`
- engine stack lines, when present:
  - `stack: Error: abort: ...`
  - `stack: at ...`

This is intentionally verbose for failing executions. The whole point of the
feature is to favor better debugging payloads over minimalist error strings.

## Non-Goals And Honest Limits

This work should not claim to solve:

- async stack traces across awaited guest work
- exact JS-style `Error.stack` parity inside guest AssemblyScript code
- exhaustive function-entry breadcrumbs for every helper in the runtime
- synthetic source positions for `trace(...)` calls when the guest never
  recorded them

The phrase "all functions leave crumbs" must be interpreted narrowly and
honestly for this repo: the shipped contract preserves harness-owned execution
crumbs from the active artifact-frame stack, not a compiler-instrumented trace
of every function call in the program.

## Implementation Plan

Land the work in this order so each commit stays coherent and testable.

### `debug-001`: contract and backlog

- write this note
- add explicit backlog slices to `agent-todo.md`
- add a changelog entry for the planning slice

### `debug-002`: guest debug payload runtime

- add `EventKind.Debug = 11`
- add internal crumb-snapshot helpers to the artifact-frame runtime
- add `serializeDebug(...)` plus focused internal proof for payload layout
- add a top-level bundled library export for `harnessAbort` and `harnessTrace`
- do not enable the default compile-wrapper aliases yet

Success condition:

- internal guest tests prove the payload layout and crumb capture without
  changing current host behavior

### `debug-003`: host-facing debug surface

- add `HarnessDebugCrumb`, `HarnessDebugEvent`, and `onDebug(...)`
- extend `harness/js`, `harness/wazero`, and `harness/wasmtime` to decode
  `EventKind.Debug`
- extend `harness/shared/start.cjs` cloning and event registration for nested
  debug payloads
- extend the reporter to collect and format debug details

Success condition:

- hosts and reporter understand the new event kind, even if nothing emits it by
  default yet

### `debug-004`: default bundled `--use` override path

- add `withBundledDebugUseOverrides(...)` to the compiler wrapper
- append `abort=harnessAbort` and `trace=harnessTrace` only when the user did
  not already supply overrides
- add compile-level proof for the new defaults
- add a dedicated smoke fixture compiled with explicit `--use` flags so the
  host matrix exercises the structured path directly

Success condition:

- harness-backed CLI builds start using the new structured debug path by
  default
- direct `asc` builds without the override still keep the old flat `log` path

### `debug-005`: end-to-end proof and docs cleanup

- extend CLI integration tests to assert structured trace and abort output
- extend shared host smoke coverage for debug events and crumb stacks
- refresh the ABI, guest-runtime, and host-runner docs with the shipped
  contract
- update relevant README files
- remove the backlog slice

Success condition:

- all shipped docs describe the same debug contract
- the full validation matrix passes

## Affected Repo Areas

- `assembly/assembly/internal/imports.ts`
- `assembly/assembly/internal/artifact-frame.ts`
- `assembly/assembly/internal/events.ts`
- `assembly/assembly/lib/`
- `assembly/assembly/test/internal/events.ts`
- `assembly/assembly/test/`
- `cli/as/compile.ts`
- `cli/as/compile.test.ts`
- `cli/as/virtual-files.generated.ts`
- `cli/reporter.ts`
- `cli/run.test.ts`
- `harness/shared/harness-types.d.ts`
- `harness/shared/start.cjs`
- `harness/shared/smoke-suite.cjs`
- `harness/js/index.cjs`
- `harness/wazero/addon.go`
- `harness/wasmtime/index.cjs`
- `harness/wasmtime/src/lib.rs`
- [docs/003-2026-03-17-harness-abi.md](./003-2026-03-17-harness-abi.md)
- [docs/006-2026-03-17-guest-runtime-contracts.md](./006-2026-03-17-guest-runtime-contracts.md)
- [docs/007-2026-03-17-host-runner-contract.md](./007-2026-03-17-host-runner-contract.md)
- `agent-todo.md`
- `CHANGELOG.md`
