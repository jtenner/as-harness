# `tape` Adapter TODO

Status: assertion surface landed; bundled CLI wiring remains.
Current surface plan is documented in [docs/018-2026-03-22-tape-adapter-interface.md](../../../docs/018-2026-03-22-tape-adapter-interface.md).

Implemented so far:

- `tape-002`: ship `test(...)`, `test.only(...)`, `test.skip(...)`, adapter-local
  `TestContext`, nested `t.test(...)`, `plan(...)`, `end()`, `teardown(...)`,
  and `comment(...)`, plus internal proof
- `tape-003`: add the shipped assertion subset and aliases, plus internal and
  cross-host smoke proof for nested subtests, plan accounting, teardown, and
  shared assertion lowering

Still planned:

- `tape-004`: wire `tape` into the bundled CLI surface, compile rewriting, and
  direct CLI proof, then mark the adapter shipped

Constraint: keep the adapter honest about current runtime limits; async
completion, options-object overloading, reporter APIs, timeout control,
regex-match helpers, deep-loose structural comparison, and capture / intercept
helpers stay deferred until the shared runtime can represent them directly.
