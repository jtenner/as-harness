# Harness Todo

## v0.6.0

### Blockers

- none currently.

### Risks

- keep the planned `tap` adapter honest about its current runtime fit: do not
  promise module-scope root assertions, `pragma(...)`, `bailout(...)`, timeout
  controls, options-object overloads, Promise/event helpers, matcher-heavy
  assertion families, or plugin-driven spawn / worker / snapshot / mock /
  fixture helpers before the shared runtime can model those semantics
  directly.
- keep the AVA adapter honest about its current runtime fit: do not promise
  Promise / observable execution, `t.try(...)`, timeout control, teardown
  callbacks, or AVA's snapshot-directory contract before the shared runtime can
  represent those semantics directly.
- do not expand upstream `uvu` `Assertion` object parity until the repo ships
  an adapter-local error-object contract with enough structured failure
  metadata to support future reuse such as Jasmine `throwUnless(...)`.

### Adapter: `tap`

- `tap-004`: wire `tap` into bundled CLI compile rewriting and direct CLI
  proof, then mark the adapter shipped in docs.
- implementation plan: the declaration, hook, lifecycle, assertion, and
  cross-host smoke slices are done; the remaining work is the bundled CLI
  entry, compile rewriting, direct bundled proof, and shipped-surface docs.
  Keep root assertions, `pragma(...)`, `bailout(...)`, timeout controls,
  options-object overloads, Promise/event helpers, matcher-heavy assertion
  families, and plugin-driven helpers explicitly deferred unless the shared
  runtime grows those semantics.

### Adapter: `uvu`

- `uvu-001`: add the deferred upstream `Assertion` object-parity work only
  after the shared error-object contract exists.
- implementation plan: define the shared error-object contract first, then
  lift object-parity helpers that depend on structured failure metadata.
