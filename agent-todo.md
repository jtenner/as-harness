# Harness Todo

## v0.6.0

### Blockers

- none currently.

### Risks

- keep the AVA adapter honest about its current runtime fit: do not promise
  Promise / observable execution, `t.try(...)`, timeout control, teardown
  callbacks, or AVA's snapshot-directory contract before the shared runtime can
  represent those semantics directly.
- do not expand upstream `uvu` `Assertion` object parity until the repo ships
  an adapter-local error-object contract with enough structured failure
  metadata to support future reuse such as Jasmine `throwUnless(...)`.

### Adapter: `ava`

- `ava-003`: add `test.macro(...)` title generation and argument lowering
  without inventing a fake broader TypeScript parity layer.
- `ava-004`: wire the honest sync slice into bundled CLI proof and cross-host
  smoke only after the declaration and context surfaces stop changing.
- implementation plan: land the declaration chain first, then the sync
  execution-context helpers, then macro lowering, and keep async / timeout /
  teardown / `try(...)` / snapshot-directory parity explicitly deferred unless
  the shared runtime grows those semantics.

### Adapter: `uvu`

- add the deferred upstream `Assertion` object-parity work only after that
  shared error-object contract exists.
