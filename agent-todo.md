# Harness Todo

## v0.6.0

### Blockers

- none currently.

### Risks

- keep the AVA adapter honest about its current runtime fit: do not promise
  Promise / observable execution, `t.try(...)`, timeout control, teardown
  callbacks, or AVA's snapshot-directory contract before the shared runtime can
  represent those semantics directly.
- keep the planned `tape` adapter honest about its assertion-object surface: do
  not promise async completion, options-object overloading, reporter APIs,
  timeout control, regex-match helpers, deep-loose structural comparison, or
  capture / intercept helpers before the shared runtime can model them
  directly.
- do not expand upstream `uvu` `Assertion` object parity until the repo ships
  an adapter-local error-object contract with enough structured failure
  metadata to support future reuse such as Jasmine `throwUnless(...)`.

### Adapter: `tape`

- `tape-001`: add the interface note, replace the placeholder TODO, and commit
  the live implementation slices.
- `tape-002`: ship `test(...)`, `test.only(...)`, `test.skip(...)`, adapter-local
  `TestContext`, nested `t.test(...)`, `plan(...)`, `end()`, `teardown(...)`,
  and `comment(...)`, then prove declaration behavior internally.
- `tape-003`: add the shipped assertion subset and aliases, plus one cross-host
  smoke fixture covering nested subtests, plan, teardown, comments, and the
  shared assertion mapping.
- `tape-004`: wire `tape` into bundled CLI compile rewriting and direct CLI
  proof, then mark the adapter shipped in docs.
- implementation plan: land the declaration/context shell first, then add the
  assertion surface, then bundle the adapter through the CLI. Keep async,
  options-object overloads, timeout control, reporter APIs, regex helpers,
  deep-loose comparison, and capture/intercept APIs explicitly deferred unless
  the shared runtime grows those semantics.

### Adapter: `uvu`

- `uvu-001`: add the deferred upstream `Assertion` object-parity work only
  after the shared error-object contract exists.
- implementation plan: define the shared error-object contract first, then
  lift object-parity helpers that depend on structured failure metadata.
