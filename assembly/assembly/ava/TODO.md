# `ava` Adapter TODO

Status: initial declaration slice in progress.
Current surface is documented in [docs/017-2026-03-22-ava-adapter-interface.md](../../../docs/017-2026-03-22-ava-adapter-interface.md).

Implemented so far:

- define a flat sync declaration surface around `test(...)`, modifiers, hooks,
  and the current `test.meta` placeholder
- map the declaration subset onto shared runtime metadata, including
  expected-failure and sequential execution hints
- add initial internal declaration proof plus one cross-host smoke fixture

Still deferred for this slice:

- the first adapter-local `ExecutionContext` parity helpers beyond the shared
  callback context
- `test.macro(...)`
- bundled CLI library wiring and CLI-run proof

Constraint: Promise / observable execution, `t.try(...)`, timeout control,
teardown callbacks, and AVA-specific snapshot behavior stay deferred until the
shared runtime can represent them honestly.
