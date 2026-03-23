# Abort And Trace Debug Payload Contract

This note answers how `as-harness` now overrides AssemblyScript `abort(...)`
and `trace(...)` for richer debugging, what the guest and host can honestly
report today, and why the shipped implementation uses a compile-wrapper source
rewrite instead of a default `--use` alias or compiler-owned AST mutation. The
recommendation, and now the shipped behavior, is to rewrite bare `abort(...)`
and `trace(...)` calls in harness-backed CLI builds onto bundled debug helpers,
emit a structured `Debug` event carrying artifact-frame crumbs and direct
source-location metadata where available, and treat host engine stacks as
best-effort enrichment instead of pretending that the guest can recover a
portable function-by-function stack trace after a Wasm trap.

## Research Basis

Checked on 2026-03-23 against:

- current repo runtime, ABI, reporter, compiler-wrapper, and host code
- [docs/003-2026-03-17-harness-abi.md](./003-2026-03-17-harness-abi.md)
- [docs/006-2026-03-17-guest-runtime-contracts.md](./006-2026-03-17-guest-runtime-contracts.md)
- [docs/007-2026-03-17-host-runner-contract.md](./007-2026-03-17-host-runner-contract.md)
- local `assemblyscript@0.28.10` CLI help and standard-library declarations
- official AssemblyScript stdlib docs at `https://www.assemblyscript.org/stdlib/globals.html`

The relevant upstream AssemblyScript facts and repo findings are:

- `trace(...)` is a built-in environmental function with the current signature
  `trace(msg: string, n?: i32, a0?: f64, a1?: f64, a2?: f64, a3?: f64, a4?: f64): void`
- `abort(...)` is a built-in environmental function with the current signature
  `abort(msg?: string | null, fileName?: string | null, lineNumber?: i32, columnNumber?: i32): never`
- `asc --use` aliases one global under another name and can also introduce
  integer constants
- in the current `as-harness` compile flow, `asc --use` alias lookup does not
  resolve against entry-file exports or the attempted bundled helper exports;
  the observed failure was `AS111: Element 'harnessAbort' not found.` and the
  same for `harnessTrace`
- standalone parser inspection can read one source file for syntax-driven
  analysis, but calling the parser's full validation/finish path on partially
  loaded sources throws `Error: backlog is not empty`, so the wrapper must not
  pretend it has a whole-program validation context at rewrite time
- AssemblyScript initialization was unstable when this feature tried to splice
  parsed nodes into the compiler-owned tree; the shipped path must not insert
  parsed nodes or mutate compiler-owned AST nodes
- `--debug` enables debug information in the emitted binary, but AssemblyScript
  still does not expose a portable guest-owned stack object that adapters or
  hosts can reconstruct into exact source stacks after a trap

Those facts matter because they define both the opportunity and the limit:

- `as-harness` can still override the effective `abort` and `trace` behavior
  for wrapper-driven builds, but not through the originally planned default
  `--use` alias path
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
2. bundled `harnessAbort(...)` and `harnessTrace(...)` helpers imported by a
   compile-wrapper source rewrite for harness-backed builds
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

The shipped repo now behaves like this:

- the guest ABI still imports the raw AssemblyScript `env.abort(...)` and
  `env.trace(...)` hooks
- for harness-backed CLI builds that use bundled guest libraries, the compiler
  wrapper rewrites bare `abort(...)` and `trace(...)` identifier calls in
  non-library source files before `asc` parses them
- that rewrite injects a direct import from
  `~/.as-harness/internal/debug` and remaps those bare calls onto
  `harnessAbort(...)` and `harnessTrace(...)`
- abort calls with fewer than four arguments receive synthesized file, line,
  and column arguments derived from the source text offset of the callsite
- explicit user `--use abort=...` or `--use trace=...` options remain
  authoritative; when those are present, the wrapper disables its default
  rewrite path
- the guest event ABI now includes `EventKind.Debug = 11`
- the guest runtime snapshots the active artifact-frame stack into structured
  breadcrumb records before emitting each debug event
- `harnessAbort(...)` emits a structured debug event and then delegates to the
  raw host abort import
- `harnessTrace(...)` emits a structured debug event and does not forward to
  the raw trace import, preventing duplicate flat `log` output on wrapper-owned
  builds
- the `js`, `wazero`, and `wasmtime` hosts decode `Debug` events and expose
  them through `onDebug(...)`
- the CLI reporter renders structured `abort:` and `trace:` details with crumb
  lines, location data, and any available host-enriched engine stack lines

Direct `asc` usage, or wrapper usage with explicit user aliases, still keeps
the older raw AssemblyScript import behavior. That is intentional. The richer
debug payload path is a CLI-wrapper feature, not a new global AssemblyScript
requirement.

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

The shipped wrapper override now works like this:

- it applies only when the bundled harness library path is active
- it disables itself when the user already supplied explicit `abort=...` or
  `trace=...` aliases
- it is a wrapper-owned source rewrite, not a hardcoded requirement on all
  direct `asc` compilation paths

That keeps the feature pragmatic without hijacking advanced users' existing
custom overrides.

### 5. The source rewrite must stay syntax-driven and conservative

The shipped wrapper path parses each source file in isolation only to discover
text ranges that should be rewritten. It does not insert parsed nodes into the
compiler-owned program tree, and it does not attempt whole-program symbol
resolution.

That means:

- only bare identifier calls named `abort` and `trace` are rewritten
- property access such as `foo.abort(...)` is left alone
- the current implementation is intentionally conservative around shadowed
  local names because this wrapper hook does not own compiler symbol
  resolution
- any future semantic rewrite path would need a compiler-owned hook rather than
  more aggressive parser-side guessing

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

### Bundled internal debug helpers

The shipped wrapper imports:

- `harnessAbort(...)`
- `harnessTrace(...)`

from `~/.as-harness/internal/debug`.

This is intentionally not a global `--use` surface. The current compile flow
could not rely on `--use` resolving those helper names, even when they were
exported from attempted entry or bundled-library locations.

The wrapper injects this prelude instead:

```ts
import {
  harnessAbort as __asHarnessAbort,
  harnessTrace as __asHarnessTrace,
} from "~/.as-harness/internal/debug";
```

and then rewrites bare `abort(...)` / `trace(...)` identifiers to those local
import bindings.

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

## Implementation History

The work landed in five coherent slices:

### `debug-001`: contract and backlog

- wrote this note in its initial planning form
- staged explicit backlog slices and changelog coverage

### `debug-002`: guest debug payload runtime

- added `EventKind.Debug = 11`
- added artifact-frame crumb snapshot support
- added structured debug payload serialization
- added `harnessAbort(...)` and `harnessTrace(...)` in the internal runtime

### `debug-003`: host-facing debug surface

- added `HarnessDebugCrumb`, `HarnessDebugEvent`, and `onDebug(...)`
- extended `js`, `wazero`, and `wasmtime` to decode `EventKind.Debug`
- extended shared `start()` cloning and reporter rendering for nested debug
  payloads

### `debug-004`: wrapper-owned source rewrite

- dropped the unstable parsed-node mutation attempt
- confirmed that the planned default `--use` alias path was not reliable in the
  current compile flow
- added a conservative compile-wrapper source rewrite for harness-backed builds
- kept explicit user `--use abort=...` and `trace=...` aliases authoritative
- added compile-level proof for the enablement rules and CLI proof for emitted
  structured abort output

### `debug-005`: proof and docs cleanup

- refreshed the ABI, guest-runtime, and host-runner docs to describe the
  shipped source-rewrite path
- removed the remaining backlog slice
- reran the full validation matrix

## Affected Repo Areas

- `assembly/assembly/internal/imports.ts`
- `assembly/assembly/internal/artifact-frame.ts`
- `assembly/assembly/internal/events.ts`
- `assembly/assembly/internal/debug.ts`
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
