# Harness Todo

## v0.6.0

### Blockers

- none currently.

### Risks

- keep the AVA adapter honest about its current runtime fit: do not promise
  Promise / observable execution, `t.try(...)`, timeout control, teardown
  callbacks, or AVA's snapshot-directory contract before the shared runtime can
  represent those semantics directly.
- keep the new structured assertion-record contract honest: `uvu` can now
  reconstruct failed assertions from shared metadata, but the current Wasm trap
  boundary still cannot preserve arbitrary JS object identity, so shipped
  parity must keep `actual` and `expects` as rendered guest values.

### Adapter: `uvu`

- `uvu-assertion-003`: ship `uvu/assert` `Assertion` parity plus the remaining
  helper surface that depends on that metadata, then remove the backlog item.
