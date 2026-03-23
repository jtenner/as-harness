# `tape` Adapter TODO

Status: planned, not started.
Current surface plan is documented in [docs/018-2026-03-22-tape-adapter-interface.md](../../../docs/018-2026-03-22-tape-adapter-interface.md).

Planned implementation slices:

- `tape-001`: document the honest sync surface and record the live slice plan
- `tape-002`: ship `test(...)`, `test.only(...)`, `test.skip(...)`, adapter-local
  `TestContext`, nested `t.test(...)`, `plan(...)`, `end()`, `teardown(...)`,
  and `comment(...)`, plus internal proof
- `tape-003`: add the shipped assertion subset and aliases, then prove the
  surface through a cross-host smoke fixture
- `tape-004`: wire `tape` into the bundled CLI surface, compile rewriting, and
  direct CLI proof, then mark the adapter shipped

Constraint: keep the adapter honest about current runtime limits; async
completion, options-object overloading, reporter APIs, timeout control,
regex-match helpers, deep-loose structural comparison, and capture / intercept
helpers stay deferred until the shared runtime can represent them directly.
