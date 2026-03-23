# `ava` Adapter TODO

Status: bundled thin synchronous adapter shipped.
Current surface is documented in [docs/017-2026-03-22-ava-adapter-interface.md](../../../docs/017-2026-03-22-ava-adapter-interface.md).

Implemented so far:

- define a flat sync declaration surface around `test(...)`, modifiers, hooks,
  and the current `test.meta` placeholder
- map the declaration subset onto shared runtime metadata, including
  expected-failure and sequential execution hints
- add an adapter-local synchronous `ExecutionContext` with `title`, `log(...)`,
  a string-keyed shared `t.context` bag, and the first direct `t.*` assertion
  subset that maps onto the shared assertion bridge
- add an AssemblyScript-friendly macro layer with `test.macro(...)`,
  `test.use(...)` / `test.useNamed(...)`, modifier variants, argument lowering,
  and whitespace-normalized title generation
- wire the shipped sync slice into the bundled CLI library set, compile
  rewriting, and direct CLI proof
- add internal declaration plus execution-context proof and one cross-host smoke
  fixture that executes the AVA slice through the shared hosts

Still deferred for the adapter:

- Promise / observable execution
- `t.try(...)`
- timeout control
- teardown callbacks
- AVA-specific snapshot-directory behavior
