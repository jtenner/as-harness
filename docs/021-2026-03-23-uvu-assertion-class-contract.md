# `uvu` `Assertion` Class Contract

This note answers how `as-harness` should implement upstream `uvu`'s
`Assertion` class honestly, what structured failure metadata the shared guest
runtime must preserve for that work, and which exact `uvu/assert` behaviors are
worth shipping now across `assembly/`, `cli/`, and the host matrix. The
recommendation in this note is now the shipped contract: the shared runtime
stores a guest-side assertion record, and `uvu/assert` reconstructs
adapter-local `Assertion` objects inside trap observers instead of pretending
the current Wasm boundary can preserve arbitrary thrown JS objects.

Repository policy note as of 2026-03-23: public installation is npm-only, annotated tags create notes-only GitHub release pages, and `@as-harness/cli` expects a consumer-installed `assemblyscript` peer.

## Research Basis

Checked on 2026-03-23 against:

- `uvu@0.5.6` package tarball from
  `https://registry.npmjs.org/uvu/-/uvu-0.5.6.tgz`
- published `package/assert/index.d.ts`
- published `package/assert/index.js`
- published `package/index.d.ts`
- upstream README from
  `https://raw.githubusercontent.com/lukeed/uvu/v0.5.6/readme.md`
- current `as-harness` runtime, `uvu`, and `uvu/assert` adapter code

## Upstream Surface That Matters

The upstream `uvu/assert` package ships:

- a named `Assertion` class extending `Error`
- assertion helpers that throw `Assertion` objects on mismatch
- `throws(...)` logic that recognizes an upstream `Assertion` instance and
  rethrows it unchanged
- negated helpers under `not`, including `not.ok`, `not.snapshot`, and
  `not.fixture`

The published upstream `Assertion` shape is:

```ts
export class Assertion extends Error {
  name: "Assertion";
  code: "ERR_ASSERTION";
  details: false | string;
  generated: boolean;
  operator: string;
  expects: any;
  actual: any;
}
```

The important runtime property is not inheritance itself. It is the structured
failure record that callers can observe when `throws(...)` catches a failed
assertion.

## Current Repo Constraint

The shared guest runtime currently preserves only:

- failure kind
- an optional error-message string pointer

That is sufficient for host-owned pass/fail reporting, but not for adapter
surfaces that need to inspect a failed assertion as a structured object after a
trap has been observed. A Wasm trap raised through the current trampoline does
not carry an arbitrary guest object payload that another AssemblyScript helper
can recover later.

Because of that, direct upstream-style `throw new Assertion(...)` parity is not
honest today. The adapter must reconstruct its own `Assertion` object from
metadata that the shared runtime stored before trapping.

## Recommended Contract

Add a shared assertion-record slot to the failure state with these stored
fields:

- `message: string | null`
- `details: string | null`
- `generated: bool`
- `operator: string | null`
- `actual: string | null`
- `expects: string | null`

Recommendation details:

- keep the existing failure-kind and active-message pointer APIs for the shared
  executor and host ABI
- clear the structured assertion record whenever the active error state is
  cleared
- leave non-assertion traps without any structured record
- add a small shared API to stage a structured assertion failure and a small
  shared API to read it back

## Honest Divergence From Upstream

`as-harness` should document one explicit divergence in the shipped
`Assertion` class:

- `actual` and `expects` are preserved as reflected render strings, not as the
  original arbitrary JS values that upstream `uvu` can keep in a Node process

That is the honest contract for the current AssemblyScript and Wasm boundary.
The repo already has stable reflected rendering for guest values, and those
rendered strings are enough for practical parity in `throws(...)` assertions and
future adapter reuse such as Jasmine `throwUnless(...)`.

## Shipped `uvu/assert` Scope After This Work

Ship now:

- `Assertion`
- structured `throws(...)` parity that rethrows inner reconstructed
  adapter-local `Assertion` instances unchanged at the adapter level
- structured `not.throws(...)` parity that still fails on any observed trap
  with the adapter's own `not.throws` assertion record

Keep deferred:

- any promise-based or async throw helpers
- arbitrary non-assertion thrown-object inspection beyond the existing trap
  boundary
- exact upstream `any` payload parity for `actual` and `expects`
- broader negated helper parity around the repo-local artifact-backed
  `snapshot(...)` and `fixture(...)` semantics

## Implementation Slices

### `uvu-assertion-001`: contract and planning

- write this note
- replace the old vague backlog wording with explicit slices
- point the `uvu` TODO at the shared-record contract and final parity outcome

### `uvu-assertion-002`: shared structured failure metadata

- extend `assembly/assembly/internal/failure-state.ts` with an assertion record
- add helper APIs to store, read, and clear that record
- add focused internal proof for message, operator, details, and rendered value
  storage

### `uvu-assertion-003`: adapter parity and proof

- export `Assertion` from `assembly/assembly/uvu/assert.ts`
- refactor `uvu/assert` helpers to stage structured failures before trapping
- update `throws(...)` and `not.throws(...)` to reconstruct and validate
  adapter-local `Assertion` objects
- extend internal, smoke, and bundled CLI proof
- refresh shipped docs and remove the backlog item

## Affected Repo Areas

- `assembly/assembly/internal/failure-state.ts`
- `assembly/assembly/internal/assert-bridge.ts`
- `assembly/assembly/uvu/assert.ts`
- `assembly/assembly/test/internal/failure-state.ts`
- `assembly/assembly/test/internal/uvu-assert.ts`
- `assembly/assembly/test/uvu-assert-smoke.ts`
- `cli/run.test.ts`
- `docs/014-2026-03-22-uvu-adapter-interface.md`
- `assembly/assembly/uvu/TODO.md`
- `agent-todo.md`
