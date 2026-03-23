# `ava` Adapter TODO

Status: declaration and synchronous context slices in progress.
Current surface is documented in [docs/017-2026-03-22-ava-adapter-interface.md](../../../docs/017-2026-03-22-ava-adapter-interface.md).

Implemented so far:

- define a flat sync declaration surface around `test(...)`, modifiers, hooks,
  and the current `test.meta` placeholder
- map the declaration subset onto shared runtime metadata, including
  expected-failure and sequential execution hints
- add an adapter-local synchronous `ExecutionContext` with `title`, `log(...)`,
  a string-keyed shared `t.context` bag, and the first direct `t.*` assertion
  subset that maps onto the shared assertion bridge
- add internal declaration plus execution-context proof and one cross-host smoke
  fixture that executes the AVA slice through the shared hosts

Still deferred for this slice:

- `test.macro(...)`
- bundled CLI library wiring and CLI-run proof

Constraint: Promise / observable execution, `t.try(...)`, timeout control,
teardown callbacks, and AVA-specific snapshot behavior stay deferred until the
shared runtime can represent them honestly.
