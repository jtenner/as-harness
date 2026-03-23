# Harness Todo

## v0.6.0

### Blockers

- none currently.

### Risks

- keep the AVA adapter honest about its current runtime fit: do not promise
  Promise / observable execution, `t.try(...)`, timeout control, teardown
  callbacks, or AVA's snapshot-directory contract before the shared runtime can
  represent those semantics directly.
- keep the new structured assertion-record contract honest: it should preserve
  enough metadata for `uvu` parity and future thrown-assertion reuse, but it
  must not pretend the current Wasm trap boundary can preserve arbitrary JS
  object identity.

### Adapter: `uvu`

- `uvu-assertion-001`: document the `uvu` `Assertion` contract and replace the
  old vague backlog wording with explicit implementation slices.
- `uvu-assertion-002`: add shared structured assertion metadata to the failure
  state so guest adapters can reconstruct failed assertions after a trap.
- `uvu-assertion-003`: ship `uvu/assert` `Assertion` parity plus the remaining
  helper surface that depends on that metadata, then remove the backlog item.
