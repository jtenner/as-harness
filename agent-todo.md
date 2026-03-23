# Harness Todo

## v0.6.0

### Blockers

- none currently.

### Risks

- keep the planned `qunit` adapter honest about its current runtime fit: do not
  promise Promise-returning tests or hooks, async assertions, `test.each(...)`,
  options-object module overloads, dynamic JS `this` test context,
  property-specific assertion families, or reporter/config callbacks before the
  shared runtime can model those semantics directly.
- keep the AVA adapter honest about its current runtime fit: do not promise
  Promise / observable execution, `t.try(...)`, timeout control, teardown
  callbacks, or AVA's snapshot-directory contract before the shared runtime can
  represent those semantics directly.
- do not expand upstream `uvu` `Assertion` object parity until the repo ships
  an adapter-local error-object contract with enough structured failure
  metadata to support future reuse such as Jasmine `throwUnless(...)`.

### Adapter: `qunit`

- `qunit-004`: wire `qunit` into bundled CLI compile rewriting and direct CLI
  proof, then mark the adapter shipped in docs.
- implementation plan: the naming correction plus declaration/module/assertion
  slices are done; the remaining work is the bundled CLI entry and
  shipped-surface docs. Keep async helpers, `test.each(...)`, options-object
  module overloads, dynamic `this` context, property assertion families,
  `pushResult(...)`, and reporter/config APIs explicitly deferred unless the
  shared runtime grows those semantics.

### Adapter: `uvu`

- `uvu-001`: add the deferred upstream `Assertion` object-parity work only
  after the shared error-object contract exists.
- implementation plan: define the shared error-object contract first, then
  lift object-parity helpers that depend on structured failure metadata.
