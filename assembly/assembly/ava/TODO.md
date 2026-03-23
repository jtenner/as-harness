# `ava` Adapter TODO

Status: planned, not started.
Current surface is documented in [docs/017-2026-03-22-ava-adapter-interface.md](../../../docs/017-2026-03-22-ava-adapter-interface.md).

First slice:

- define a flat sync declaration surface around `test(...)`, modifiers, hooks,
  and `test.macro(...)`
- map the honest subset to shared runtime metadata
- add one traversal fixture

Constraint: Promise / observable execution, `t.try(...)`, timeout control,
teardown callbacks, and AVA-specific snapshot behavior stay deferred until the
shared runtime can represent them honestly.
