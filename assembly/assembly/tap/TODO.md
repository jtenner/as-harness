# `tap` Adapter TODO

Status: declaration, hook, lifecycle, and assertion slices landed.
Current surface plan is documented in [docs/019-2026-03-23-tap-adapter-interface.md](../../../docs/019-2026-03-23-tap-adapter-interface.md).

Implemented so far:

- `tap-001`: add the interface note, replace this placeholder TODO, and commit
  the live implementation slices
- `tap-002`: ship the root declaration / hook shell plus callback-level nested
  subtests and hooks, then prove the shape internally
- `tap-003`: add lifecycle helpers plus the shipped assertion subset, then
  prove the surface through one cross-host smoke fixture

Still planned:

- `tap-004`: wire `tap` into the bundled CLI surface, compile rewriting, and
  direct CLI proof, then mark the adapter shipped

Constraint: keep the adapter honest about current runtime limits; module-scope
root assertions, `pragma(...)`, `bailout(...)`, timeout controls, options-object
overloads, Promise/event helpers, matcher-heavy assertion families, and
plugin-driven spawn / worker / snapshot / mock / fixture helpers stay deferred
until the shared runtime can represent those semantics directly.
