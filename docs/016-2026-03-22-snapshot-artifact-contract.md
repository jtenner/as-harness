# Snapshot Artifact Contract

This note answers how `as-harness` should store and resolve snapshot artifacts
for the current `v0.4.0` cycle, recommends keeping a host-owned persisted
artifact model with a project-root snapshot tree plus `as-pect`-compatible
`.snap` file contents, and identifies the affected work across `assembly/`,
`harness/`, and `cli/`.

## Recommendation

- keep snapshot and fixture I/O host-owned
- persist snapshots under `project/__snapshots__/path/to/file.snap`
- resolve the owning snapshot file from the active declaration source file, not
  from the runtime node label
- keep the on-disk `.snap` grammar compatible with the `as-pect` export-map
  shape:
  `exports[\`key\`] = \`value\`;`
- keep the first comparison policy stricter than `as-pect`:
  missing, mismatched, and stale unmatched entries fail unless the user opts
  into explicit snapshot updates

## Owning File Rule

For a declaration source file:

- `project/tests/math/add.test.ts`

the owning snapshot file is:

- `project/__snapshots__/tests/math/add.test.snap`

This keeps snapshots in one project-owned tree while still mirroring the source
layout closely enough for deterministic lookup and review.

## Entry Identity Rule

Each persisted snapshot entry is keyed by:

- active declaration file identity
- active execution name
- occurrence ordinal within that execution

The persisted key shape for this cycle is:

- `name~(number)`

Examples:

- `adds two values~(0)`
- `adds two values~(1)`
- `beforeEach hook~(0)`

The key is grouped under one owning `.snap` file, not spread across many files.

## File Format

Snapshot files use the `as-pect`-style export-map grammar:

```js
exports[`adds two values~(0)`] = `1 + 1 = 2`;

exports[`adds two values~(1)`] = `2 + 2 = 4`;
```

Reasons:

- easy to parse without inventing a custom text format
- easy to rewrite deterministically
- familiar enough to users coming from `as-pect`
- works for line-based diffs in normal source control tooling

## Compare Rules

Normal compare mode:

- every entry in the loaded manifest starts unmatched
- each runtime snapshot assertion must either resolve an existing entry or fail
- once an existing entry is resolved, it is marked matched even if the value
  mismatches, so finalize only reports truly untouched stale expectations
- after execution, any still-unmatched entry in a touched snapshot file fails
  the run as stale

Update mode:

- enabled only by an explicit CLI flag
- matching entries remain unchanged
- missing or mismatched entries are rewritten
- stale unmatched entries are removed from the rewritten file

This differs intentionally from `as-pect`, which tolerated added snapshots in
compare mode. The `as-harness` direction keeps ordinary runs read-only.

## Fixture Rule

Fixture reads stay separate from snapshots.

For a declaration source file:

- `project/tests/math/add.test.ts`

fixture paths resolve under:

- `project/__fixtures__/tests/math/...`

The active declaration file still determines the owning source location, but
fixtures and snapshots do not share one directory.

## Scope For The Next Slices

This note freezes only:

- snapshot path layout
- snapshot key shape
- snapshot file grammar
- compare vs update semantics

It does not yet freeze:

- the exact guest-side push/pop descriptor shape
- the exact host-readable artifact-frame ABI
- the final public `uvu/assert` helper signatures
