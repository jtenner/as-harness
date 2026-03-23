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

### Adapter: `uvu`

- `uvu-001`: add the deferred upstream `Assertion` object-parity work only
  after the shared error-object contract exists.
- implementation plan: define the shared error-object contract first, then
  lift object-parity helpers that depend on structured failure metadata.
